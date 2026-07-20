import type { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { videoManagerSession } from '../manager/session';
import { resetControlledCursorCaptureState } from './controlled-cursor';
import { resetViewportNavigationState } from './shared';

type VideoManagerStopContext = {
  mode: CaptureMode | null;
  shouldResetImmediately: boolean;
  tabId: number | null;
};

export function beginVideoRecordingStop(): VideoManagerStopContext {
  videoManagerSession.isStopping = true;
  const context: VideoManagerStopContext = {
    tabId: videoManagerSession.recordingTabId,
    mode: videoManagerSession.currentCaptureMode,
    shouldResetImmediately:
      (videoManagerSession.isStarting && !videoManagerSession.offscreenStartDispatched) ||
      videoManagerSession.currentCountdownSessionId !== null,
  };

  videoManagerSession.isStarting = false;
  videoManagerSession.offscreenStartDispatched = false;
  videoManagerSession.currentCountdownSessionId = null;
  resetViewportNavigationState();

  if (context.shouldResetImmediately) {
    videoManagerSession.recordingTabId = null;
    videoManagerSession.currentCaptureMode = null;
  }

  return context;
}

export function finishVideoRecordingStop(): void {
  videoManagerSession.isStopping = false;
  videoManagerSession.openEditorAfterRecording = false;
  resetControlledCursorCaptureState();
}

export function resetCompletedVideoRecordingSession(recordingId?: string): void {
  if (
    recordingId !== undefined &&
    videoManagerSession.currentRecordingId !== null &&
    videoManagerSession.currentRecordingId !== recordingId
  ) {
    return;
  }

  videoManagerSession.currentRecordingId = null;
  videoManagerSession.recordingTabId = null;
  videoManagerSession.currentCaptureMode = null;
  videoManagerSession.currentCountdownSessionId = null;
  videoManagerSession.isStarting = false;
  videoManagerSession.offscreenStartDispatched = false;
  resetViewportNavigationState();
}
