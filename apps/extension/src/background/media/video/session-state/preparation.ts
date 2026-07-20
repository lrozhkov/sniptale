import type { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import {
  createVideoRecordingLiveMediaState,
  VideoRecordingStatus,
  type VideoRecordingSettings,
  type VideoViewportPresetSelection,
} from '@sniptale/runtime-contracts/video/types/types';
import { setVideoRecordingRuntimeState } from '../runtime/session-state';
import { videoManagerSession } from '../manager/session';
import { resetControlledCursorCaptureState } from './controlled-cursor';
import { resetViewportNavigationState } from './shared';

/**
 * Enters the PREPARING state and resets navigation-related start bookkeeping for a new recording.
 */
export function beginVideoRecordingPreparation(
  captureMode: CaptureMode,
  settingsOrViewportPreset?: VideoRecordingSettings | VideoViewportPresetSelection,
  viewportPreset?: VideoViewportPresetSelection
): void {
  const settings = isVideoRecordingSettings(settingsOrViewportPreset)
    ? settingsOrViewportPreset
    : null;
  const resolvedViewportPreset = isVideoViewportPresetSelection(settingsOrViewportPreset)
    ? settingsOrViewportPreset
    : viewportPreset;

  videoManagerSession.isStarting = true;
  videoManagerSession.offscreenStartDispatched = false;
  videoManagerSession.currentCaptureMode = captureMode;
  resetViewportNavigationState();
  resetControlledCursorCaptureState();
  setVideoRecordingRuntimeState({
    status: VideoRecordingStatus.PREPARING,
    duration: 0,
    countdownEndsAt: null,
    captureMode,
    captureSource: null,
    viewportPreset: resolvedViewportPreset ?? null,
    liveMedia: settings ? createVideoRecordingLiveMediaState(settings) : null,
    error: null,
  });
}

function isVideoRecordingSettings(value: unknown): value is VideoRecordingSettings {
  return typeof value === 'object' && value !== null && 'microphoneEnabled' in value;
}

function isVideoViewportPresetSelection(value: unknown): value is VideoViewportPresetSelection {
  return typeof value === 'object' && value !== null && 'width' in value && 'height' in value;
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
  resetViewportNavigationState();
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
