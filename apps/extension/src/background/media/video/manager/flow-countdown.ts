import {
  VideoRecordingStatus,
  type CaptureMode,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { setVideoRecordingCountdownSessionId } from '../session-state';
import { setVideoRecordingRuntimeState } from '../runtime/session-state';
import { videoManagerSession } from './session';
import { waitForCountdownTimer } from '../ui/countdown';
import { isVideoRecordingStartCancelled } from './flow-cancellation';

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
    await handleIncompleteVideoRecordingCountdown(sessionId);
    return false;
  }

  setVideoRecordingCountdownSessionId(null);
  return true;
}

export async function handleIncompleteVideoRecordingCountdown(
  sessionId: string,
  _tabId?: number | null
) {
  if (videoManagerSession.currentCountdownSessionId === sessionId) {
    setVideoRecordingCountdownSessionId(null);
  }
}
