import { createLogger } from '@sniptale/platform/observability/logger';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import {
  getVideoRecordingCaptureMode,
  getVideoRecordingTabId,
  hasActiveVideoRecordingSession,
  isControlledCursorCaptureEnabled,
  isControlledCursorNavigationPending,
} from '../../session-state';
import { syncControlledCursorCapture } from './controlled-cursor/messages';
import { getBackgroundRuntimeMessaging } from '../../../../routing-contracts/runtime-messaging/services';

const logger = createLogger({ namespace: 'BackgroundVideoRuntimeControls' });

type RecordingControlResult =
  | { result: 'accepted' }
  | { result: 'blocked' | 'no-active-recording' }
  | { error: string; result: 'failed' };

async function sendRecordingCommand(
  type: VideoMessageType.OFFSCREEN_PAUSE_RECORDING | VideoMessageType.OFFSCREEN_RESUME_RECORDING,
  actionLabel: 'pause' | 'resume'
): Promise<void> {
  try {
    await getBackgroundRuntimeMessaging().sendRuntimeMessage(
      attachOffscreenCommandCapability({ type })
    );
  } catch (error) {
    logger.error(`Failed to ${actionLabel} recording`, error);
    throw error;
  }
}

function ensureActiveRecordingSession(actionLabel: 'pause' | 'resume'): boolean {
  if (hasActiveVideoRecordingSession()) {
    return true;
  }

  logger.warn(`Cannot ${actionLabel} because no recording is active`);
  return false;
}

function shouldBlockControlledCursorResume(): boolean {
  if (!isControlledCursorCaptureEnabled() || !isControlledCursorNavigationPending()) {
    return false;
  }

  logger.warn('Cannot resume controlled cursor capture while navigation re-bootstrap is pending');
  return true;
}

function shouldSyncTelemetryCaptureState(): boolean {
  if (isControlledCursorCaptureEnabled()) {
    return true;
  }

  const captureMode = getVideoRecordingCaptureMode();
  return (
    captureMode === CaptureMode.TAB ||
    captureMode === CaptureMode.TAB_CROP ||
    captureMode === CaptureMode.VIEWPORT_EMULATION
  );
}

function resolveTelemetrySyncLabel(): 'controlled cursor capture' | 'recording telemetry capture' {
  return isControlledCursorCaptureEnabled()
    ? 'controlled cursor capture'
    : 'recording telemetry capture';
}

async function syncControlledCursorCaptureState(actionLabel: 'pause' | 'resume'): Promise<void> {
  if (!shouldSyncTelemetryCaptureState()) {
    return;
  }

  if (actionLabel === 'resume' && shouldBlockControlledCursorResume()) {
    return;
  }

  const tabId = getVideoRecordingTabId();
  if (tabId === null) {
    return;
  }

  try {
    await syncControlledCursorCapture(tabId, actionLabel);
  } catch (error) {
    logger.error(`Failed to ${actionLabel} ${resolveTelemetrySyncLabel()}`, error);
    throw error;
  }
}

export async function pauseRecording(): Promise<RecordingControlResult> {
  if (!ensureActiveRecordingSession('pause')) {
    return { result: 'no-active-recording' };
  }

  try {
    await Promise.all([
      sendRecordingCommand(VideoMessageType.OFFSCREEN_PAUSE_RECORDING, 'pause'),
      syncControlledCursorCaptureState('pause'),
    ]);
    return { result: 'accepted' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), result: 'failed' };
  }
}

export async function resumeRecording(): Promise<RecordingControlResult> {
  if (!ensureActiveRecordingSession('resume')) {
    return { result: 'no-active-recording' };
  }

  if (shouldBlockControlledCursorResume()) {
    return { result: 'blocked' };
  }

  try {
    await Promise.all([
      sendRecordingCommand(VideoMessageType.OFFSCREEN_RESUME_RECORDING, 'resume'),
      syncControlledCursorCaptureState('resume'),
    ]);
    return { result: 'accepted' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), result: 'failed' };
  }
}
