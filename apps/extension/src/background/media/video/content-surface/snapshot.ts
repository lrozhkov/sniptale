import type { VideoRecordingSurfaceSnapshot } from '@sniptale/runtime-contracts/video/types/messages.surface';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import {
  VIDEO_AUTO_FADE_DELAYS,
  VideoRecordingStatus,
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
  const ownsRecording = lease.recordingId !== null;
  const liveMedia = ownsRecording ? state.liveMedia : null;
  return {
    autoFadeDelay: VIDEO_AUTO_FADE_DELAYS.includes(settings.autoFadeDelay as VideoAutoFadeDelay)
      ? (settings.autoFadeDelay as VideoAutoFadeDelay)
      : 0,
    capabilityEpoch: lease.capabilityEpoch,
    cursorSpotlightEnabled: settings.recordingSurface?.cursorSpotlightEnabled ?? false,
    cursorDimmingEnabled: settings.recordingSurface?.cursorDimmingEnabled ?? false,
    cursorClickAnimationEnabled: settings.recordingSurface?.cursorClickAnimationEnabled ?? false,
    ...(settings.recordingSurface?.cursorEffects
      ? { cursorEffects: settings.recordingSurface.cursorEffects }
      : {}),
    documentGeneration: lease.documentGeneration,
    duration: ownsRecording ? state.duration : 0,
    entry: lease.entry,
    errorCode: ownsRecording ? state.error : null,
    lifecycle: lease.lifecycle,
    microphoneEnabled: liveMedia?.microphoneEnabled ?? settings.microphoneEnabled,
    microphoneDeviceId: liveMedia?.microphoneDeviceId ?? settings.microphoneDeviceId,
    peerGeneration: lease.peerGeneration,
    recordingId: lease.recordingId,
    status: ownsRecording ? state.status : VideoRecordingStatus.IDLE,
    surfaceSessionId: lease.surfaceSessionId,
    toolbarRequested: lease.toolbarRequested,
    webcamEnabled: liveMedia?.webcamEnabled ?? settings.webcamEnabled === true,
    webcamDeviceId: liveMedia?.webcamDeviceId ?? settings.webcamDeviceId ?? null,
    webcamPresentation: settings.webcamPresentation ?? DEFAULT_VIDEO_SETTINGS.webcamPresentation!,
  };
}
