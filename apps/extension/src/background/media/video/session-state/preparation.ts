import type { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import {
  createVideoRecordingLiveMediaState,
  VideoRecordingStatus,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { setVideoRecordingRuntimeState } from '../runtime/session-state';
import { videoManagerSession } from '../manager/session';
import { resetControlledCursorCaptureState } from './controlled-cursor';

/**
 * Enters the PREPARING state and resets navigation-related start bookkeeping for a new recording.
 */
export function beginVideoRecordingPreparation(
  captureMode: CaptureMode,
  settings: VideoRecordingSettings,
  viewportPresetId: string | null
): void {
  videoManagerSession.isStarting = true;
  videoManagerSession.offscreenStartDispatched = false;
  videoManagerSession.currentCaptureMode = captureMode;
  resetControlledCursorCaptureState();
  setVideoRecordingRuntimeState({
    status: VideoRecordingStatus.PREPARING,
    duration: 0,
    countdownEndsAt: null,
    captureMode,
    captureSource: null,
    cropRegion: null,
    viewportPresetId,
    liveMedia: createVideoRecordingLiveMediaState(settings),
    error: null,
  });
}

/**
 * Clears start-related session bindings while preserving the active recording id.
 */
export function resetVideoRecordingStartSession(): void {
  videoManagerSession.isStarting = false;
  videoManagerSession.offscreenStartDispatched = false;
  videoManagerSession.recordingTabId = null;
  videoManagerSession.currentCaptureMode = null;
  videoManagerSession.currentCountdownSessionId = null;
  resetControlledCursorCaptureState();
}

export function markVideoRecordingPreparationSettled(): void {
  videoManagerSession.isStarting = false;
  videoManagerSession.offscreenStartDispatched = false;
}

export function markVideoRecordingOffscreenStartDispatched(): void {
  videoManagerSession.offscreenStartDispatched = true;
}

export function clearVideoRecordingOffscreenStartDispatched(): void {
  videoManagerSession.offscreenStartDispatched = false;
}

export function restoreVideoRecordingOffscreenStartPending(): void {
  videoManagerSession.isStarting = true;
  videoManagerSession.offscreenStartDispatched = true;
}
