import { createLogger } from '@sniptale/platform/observability/logger';
import {
  CaptureMode,
  normalizeVideoSourceCount,
} from '@sniptale/runtime-contracts/video/types/types';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import { getCaptureSurfaceService, type AppliedCaptureSurface } from '../../../capture-surface';
import { cancelVideoSourceReadyWait, waitForVideoSourceReady } from '../capture-surface';
import { supportsSystemAudio } from '../capture-source';
import type { enableAnnotationsIfNeeded, resolveCaptureSource } from './preflight';
import { attemptDiagnosticsStart } from './diagnostics';
import { sendOffscreenBeginRecording, sendOffscreenStartRecording } from './start-helpers';
import { markVideoRecordingOffscreenStartDispatched } from '../session-state';
import { isVideoRecordingStartCancelled } from './flow-cancellation';

const logger = createLogger({ namespace: 'BackgroundVideoFlowTransport:FinalizeStart' });

type RecordingStartContext = {
  tabId: number | null;
  captureMode: CaptureMode;
  captureSource: NonNullable<Awaited<ReturnType<typeof resolveCaptureSource>>>;
  generation: number;
  recordingId: string;
  settings: VideoRecordingSettings;
  surface: AppliedCaptureSurface | null;
  streamInstanceId: string;
  viewport?: Awaited<ReturnType<typeof enableAnnotationsIfNeeded>>;
};

function resolveOffscreenStartSettings(
  captureMode: CaptureMode,
  settings: VideoRecordingSettings
): VideoRecordingSettings {
  const multiSource =
    captureMode === CaptureMode.SCREEN && normalizeVideoSourceCount(settings.sourceCount) > 1;
  return supportsSystemAudio(captureMode) && !multiSource
    ? settings
    : { ...settings, systemAudioEnabled: false };
}

function waitForRecordingSourceAdmission(
  context: RecordingStartContext,
  multiSource: boolean
): Promise<string> | null {
  if (multiSource) return null;
  const requiresStableViewport =
    context.captureMode === CaptureMode.TAB_CROP || context.surface?.target === 'viewport';
  return waitForVideoSourceReady({
    recordingId: context.recordingId,
    expectedStreamInstanceId: context.streamInstanceId,
    expectedViewport: requiresStableViewport ? (context.viewport ?? null) : null,
    tabId: context.tabId,
    ...(context.captureMode === CaptureMode.TAB_CROP
      ? { viewportMismatchPolicy: 'remap' as const }
      : {}),
  });
}

export async function finalizeRecordingStart(
  context: RecordingStartContext
): Promise<string | null> {
  markVideoRecordingOffscreenStartDispatched();
  await attemptDiagnosticsStart({
    captureMode: context.captureMode,
    settings: context.settings,
    ...(context.tabId === null ? {} : { tabId: context.tabId }),
    ...(context.viewport === undefined ? {} : { viewport: context.viewport }),
  });
  if (isVideoRecordingStartCancelled(context.tabId, context.captureMode)) {
    throw new Error('Recording start was cancelled before source dispatch');
  }

  const multiSource =
    context.captureMode === CaptureMode.SCREEN &&
    normalizeVideoSourceCount(context.settings.sourceCount) > 1;
  const ready = waitForRecordingSourceAdmission(context, multiSource);
  const observedReady = ready?.catch(() => null);
  try {
    await sendOffscreenStartRecording({
      captureMode: context.captureMode,
      captureSource: context.captureSource,
      generation: context.generation,
      recordingId: context.recordingId,
      streamInstanceId: context.streamInstanceId,
      recordingTabId: context.captureMode === CaptureMode.CAMERA ? null : context.tabId,
      settings: resolveOffscreenStartSettings(context.captureMode, context.settings),
      surface: context.surface,
      ...(context.viewport === undefined ? {} : { viewport: context.viewport }),
    });
  } catch (error) {
    cancelVideoSourceReadyWait(context.recordingId, error);
    await observedReady;
    throw error;
  }
  if (!ready) return context.streamInstanceId;
  const streamInstanceId = await ready;
  if (context.surface?.target === 'viewport') {
    await getCaptureSurfaceService().reassert({
      sessionId: context.surface.sessionId,
      leaseId: context.surface.leaseId,
      generation: context.surface.generation,
    });
  }
  logger.debug('Raw recording source validated', {
    recordingId: context.recordingId,
    streamInstanceId,
  });
  return streamInstanceId;
}

export function beginPreparedRecording(args: {
  generation: number;
  recordingId: string;
  streamInstanceId: string;
}): Promise<void> {
  return sendOffscreenBeginRecording(args);
}
