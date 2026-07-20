import { translate } from '../../../../platform/i18n';
import { awaitBestEffort } from '@sniptale/foundation/best-effort';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  VideoRecordingStatus,
  type CaptureMode,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { notifyRecordingStartFailed } from '../runtime/manager';
import { setVideoRecordingCountdownSessionId } from '../session-state';
import { setVideoRecordingRuntimeState } from '../runtime/session-state';
import { videoManagerSession } from './session';
import { waitForCountdownTimer } from '../ui/countdown';
import { detachDebugger } from '../../../debugger/session/detach';
import { clearViewport } from '../../../debugger/workspace';
import { isVideoRecordingStartCancelled } from './flow-cancellation';

const logger = createLogger({ namespace: 'BackgroundVideoCountdown' });

export async function runVideoRecordingCountdown(
  tabId: number | null,
  captureMode: CaptureMode,
  settings: VideoRecordingSettings
) {
  const sessionId = crypto.randomUUID();
  setVideoRecordingCountdownSessionId(sessionId);

  if (settings.countdownSeconds > 0) {
    setVideoRecordingRuntimeState({
      status: VideoRecordingStatus.COUNTDOWN,
      countdownEndsAt: Date.now() + settings.countdownSeconds * 1000,
    });
  } else {
    setVideoRecordingRuntimeState({
      status: VideoRecordingStatus.PREPARING,
      countdownEndsAt: null,
    });
  }

  const countdownCompleted = await waitForCountdownTimer(
    sessionId,
    settings.countdownSeconds * 1000,
    () =>
      videoManagerSession.currentCountdownSessionId !== sessionId ||
      isVideoRecordingStartCancelled(tabId, captureMode)
  );
  if (!countdownCompleted) {
    await handleIncompleteVideoRecordingCountdown(sessionId, tabId);
    return false;
  }

  setVideoRecordingCountdownSessionId(null);
  return true;
}

export async function handleIncompleteVideoRecordingCountdown(
  sessionId: string,
  tabId: number | null
) {
  if (videoManagerSession.currentCountdownSessionId === sessionId) {
    setVideoRecordingCountdownSessionId(null);
    await clearViewportAfterIncompleteCountdown(tabId);
    notifyRecordingStartFailed(translate('background.runtime.countdownIncomplete'));
  }
}

async function clearViewportAfterIncompleteCountdown(tabId: number | null): Promise<void> {
  if (tabId === null) {
    return;
  }
  await awaitBestEffort(
    clearViewport(tabId),
    logger,
    'Failed to clear viewport emulation before incomplete-countdown detach',
    { tabId }
  );
  await awaitBestEffort(
    detachDebugger(tabId, 'video-emulation'),
    logger,
    'Failed to detach viewport emulation debugger after incomplete countdown',
    { tabId }
  );
}
