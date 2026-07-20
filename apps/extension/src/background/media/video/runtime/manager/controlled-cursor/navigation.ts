import { translate } from '../../../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { getBackgroundRuntimeMessaging } from '../../../../../routing-contracts/runtime-messaging/services';
import {
  appendControlledCursorTelemetry,
  beginControlledCursorNavigation,
  clearControlledCursorNavigationPending,
  getControlledCursorNavigationEpoch,
  getControlledCursorOffsetSeconds,
  getVideoRecordingId,
  getVideoRecordingTabId,
  isControlledCursorAutoPaused,
  isControlledCursorCaptureEnabled,
  isControlledCursorNavigationPending,
  setControlledCursorAutoPaused,
  setControlledCursorOffsetSeconds,
} from '../../../session-state';
import { getVideoRecordingRuntimeState, setVideoRecordingRuntimeState } from '../../session-state';
import {
  disableControlledCursorCapture,
  enableControlledCursorCapture,
  syncControlledCursorCapture,
} from './messages';

const logger = createLogger({ namespace: 'BackgroundVideoRuntimeControlledCursor' });

const REBOOTSTRAP_RETRY_DELAYS_MS = [0, 250, 1000] as const;

function isControlledCursorNavigationTab(tabId: number): boolean {
  return isControlledCursorCaptureEnabled() && getVideoRecordingTabId() === tabId;
}

function isCurrentControlledCursorNavigation(tabId: number, navigationEpoch: number): boolean {
  return (
    isControlledCursorNavigationTab(tabId) &&
    isControlledCursorNavigationPending() &&
    getControlledCursorNavigationEpoch() === navigationEpoch
  );
}

function setNavigationPausedState(error: string): void {
  setVideoRecordingRuntimeState({
    status: VideoRecordingStatus.PAUSED,
    error,
  });
}

function waitForRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function flushControlledCursorTelemetry(
  tabId: number,
  navigationEpoch: number
): Promise<void> {
  try {
    const telemetry = await disableControlledCursorCapture(tabId);
    if (!isCurrentControlledCursorNavigation(tabId, navigationEpoch)) {
      return;
    }
    appendControlledCursorTelemetry(telemetry);
  } catch (error) {
    logger.warn('Failed to flush controlled cursor telemetry before navigation', error);
  }
}

async function pauseForNavigation(tabId: number, navigationEpoch: number): Promise<void> {
  try {
    const runtimeState = getVideoRecordingRuntimeState();
    const shouldPauseOffscreen = runtimeState.status === VideoRecordingStatus.RECORDING;
    const shouldAutoPause = isControlledCursorAutoPaused() || shouldPauseOffscreen;

    setControlledCursorAutoPaused(shouldAutoPause);
    setControlledCursorOffsetSeconds(runtimeState.duration);
    await flushControlledCursorTelemetry(tabId, navigationEpoch);

    if (!isCurrentControlledCursorNavigation(tabId, navigationEpoch)) {
      return;
    }

    if (shouldPauseOffscreen) {
      await getBackgroundRuntimeMessaging().sendRuntimeMessage(
        attachOffscreenCommandCapability({
          type: VideoMessageType.OFFSCREEN_PAUSE_RECORDING,
        })
      );
    }

    if (!isCurrentControlledCursorNavigation(tabId, navigationEpoch)) {
      return;
    }

    setNavigationPausedState(
      translate('background.runtime.controlledCursorCaptureNavigationPaused')
    );
  } catch (error) {
    logger.error('Failed to auto-pause controlled cursor capture for navigation', error);
    if (!isCurrentControlledCursorNavigation(tabId, navigationEpoch)) {
      return;
    }
    setNavigationPausedState(translate('background.runtime.controlledCursorCaptureSetupFailed'));
  }
}

async function syncBootstrapPauseState(tabId: number, navigationEpoch: number): Promise<boolean> {
  if (isControlledCursorAutoPaused()) {
    await getBackgroundRuntimeMessaging().sendRuntimeMessage(
      attachOffscreenCommandCapability({ type: VideoMessageType.OFFSCREEN_RESUME_RECORDING })
    );
    if (!isCurrentControlledCursorNavigation(tabId, navigationEpoch)) {
      return false;
    }
    setVideoRecordingRuntimeState({ error: null });
    return true;
  }

  await syncControlledCursorCapture(tabId, 'pause');
  if (!isCurrentControlledCursorNavigation(tabId, navigationEpoch)) {
    return false;
  }
  setVideoRecordingRuntimeState({ error: null });
  return true;
}

async function rebootstrapControlledCursor(tabId: number, navigationEpoch: number): Promise<void> {
  const recordingId = getVideoRecordingId();
  if (typeof recordingId !== 'string') {
    if (isCurrentControlledCursorNavigation(tabId, navigationEpoch)) {
      setNavigationPausedState(translate('background.runtime.controlledCursorCaptureSetupFailed'));
    }
    return;
  }

  for (const delayMs of REBOOTSTRAP_RETRY_DELAYS_MS) {
    if (delayMs > 0) {
      await waitForRetry(delayMs);
    }

    if (!isCurrentControlledCursorNavigation(tabId, navigationEpoch)) {
      return;
    }

    try {
      await enableControlledCursorCapture(tabId, recordingId, getControlledCursorOffsetSeconds());
      if (!isCurrentControlledCursorNavigation(tabId, navigationEpoch)) {
        return;
      }
      if (!(await syncBootstrapPauseState(tabId, navigationEpoch))) {
        return;
      }
      setControlledCursorAutoPaused(false);
      clearControlledCursorNavigationPending(navigationEpoch);
      return;
    } catch (error) {
      logger.warn('Controlled cursor re-bootstrap attempt failed', {
        delayMs,
        error,
        recordingId,
        tabId,
      });
    }
  }

  if (!isCurrentControlledCursorNavigation(tabId, navigationEpoch)) {
    return;
  }
  setNavigationPausedState(
    translate('background.runtime.controlledCursorCaptureNavigationRebootstrapFailed')
  );
}

export function handleControlledCursorTabUpdate(
  tabId: number,
  status: string | undefined
): boolean {
  if (!isControlledCursorNavigationTab(tabId)) {
    return false;
  }

  if (status === 'loading') {
    if (!isControlledCursorNavigationPending()) {
      void pauseForNavigation(tabId, beginControlledCursorNavigation());
    }
    return true;
  }

  if (status !== 'complete' || !isControlledCursorNavigationPending()) {
    return false;
  }

  void rebootstrapControlledCursor(tabId, getControlledCursorNavigationEpoch());
  return true;
}

export function handleControlledCursorNavigationStart(tabId: number): boolean {
  if (!isControlledCursorNavigationTab(tabId)) {
    return false;
  }

  void pauseForNavigation(tabId, beginControlledCursorNavigation());

  return true;
}
