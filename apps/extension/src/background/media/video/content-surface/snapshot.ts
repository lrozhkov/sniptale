import type { VideoRecordingSurfaceSnapshot } from '@sniptale/runtime-contracts/video/types/messages.surface';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import {
  VIDEO_AUTO_FADE_DELAYS,
  type VideoAutoFadeDelay,
} from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { getVideoRecordingRuntimeState } from '../runtime/session-state';
import type { VideoRecordingSurfaceLease } from './surface-lease';

export function createVideoRecordingSurfaceSnapshot(
  lease: VideoRecordingSurfaceLease,
  settings: VideoRecordingSettings
): VideoRecordingSurfaceSnapshot {
  const state = getVideoRecordingRuntimeState();
  return {
    autoFadeDelay: VIDEO_AUTO_FADE_DELAYS.includes(settings.autoFadeDelay as VideoAutoFadeDelay)
      ? (settings.autoFadeDelay as VideoAutoFadeDelay)
      : 0,
    capabilityEpoch: lease.capabilityEpoch,
    cursorSpotlightEnabled: settings.recordingSurface?.cursorSpotlightEnabled ?? false,
    documentGeneration: lease.documentGeneration,
    duration: state.duration,
    entry: lease.entry,
    errorCode: state.error,
    lifecycle: lease.lifecycle,
    microphoneEnabled: state.liveMedia?.microphoneEnabled ?? settings.microphoneEnabled,
    microphoneDeviceId: state.liveMedia?.microphoneDeviceId ?? settings.microphoneDeviceId,
    peerGeneration: lease.peerGeneration,
    recordingId: lease.recordingId,
    status: state.status,
    surfaceSessionId: lease.surfaceSessionId,
    toolbarRequested: lease.toolbarRequested,
    webcamEnabled: state.liveMedia?.webcamEnabled ?? settings.webcamEnabled === true,
    webcamDeviceId: state.liveMedia?.webcamDeviceId ?? settings.webcamDeviceId ?? null,
    webcamPresentation: settings.webcamPresentation ?? DEFAULT_VIDEO_SETTINGS.webcamPresentation!,
  };
}
