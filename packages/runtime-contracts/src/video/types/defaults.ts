import { DEFAULT_VIDEO_OUTPUT_PROFILE } from './output-profile';
import {
  VideoAutoProcessingAction,
  WebcamPresentationMode,
  WebcamPresentationShape,
} from './types';
import type { VideoAutoProcessingSettings, VideoRecordingSettings } from './types';
import { DEFAULT_WEBCAM_QUALITY_SETTINGS } from './webcam-quality';
import { DEFAULT_VIDEO_RECORDING_QUALITY_PROFILE_ID } from './quality-profiles';

export const DEFAULT_VIDEO_SETTINGS: VideoRecordingSettings = {
  microphoneEnabled: false,
  warnWithoutMicrophone: true,
  teleprompterEnabled: false,
  microphoneDeviceId: null,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  microphoneGain: 1,
  webcamEnabled: false,
  webcamDeviceId: null,
  webcamQuality: DEFAULT_WEBCAM_QUALITY_SETTINGS,
  systemAudioEnabled: true,
  sourceCount: 1,
  outputProfile: DEFAULT_VIDEO_OUTPUT_PROFILE,
  qualityProfileId: DEFAULT_VIDEO_RECORDING_QUALITY_PROFILE_ID,
  qualityProfiles: [],
  countdownSeconds: 3,
  autoFadeDelay: 0,
  interactionDiagnosticsEnabled: false,
  controlledCursorCaptureEnabled: false,
  recordingSurface: {
    toolbarEnabled: false,
    cursorSpotlightEnabled: false,
    cursorDimmingEnabled: false,
    cursorClickAnimationEnabled: false,
  },
  webcamPresentation: {
    mode: WebcamPresentationMode.SEPARATE_TRACK,
    shape: WebcamPresentationShape.CIRCLE,
    center: { x: 0.86, y: 0.82 },
    sizeFraction: 0.22,
    cropOffset: { x: 0, y: 0 },
  },
};

export const DEFAULT_VIDEO_AUTO_PROCESSING_SETTINGS: VideoAutoProcessingSettings = {
  enabled: false,
  stableSegments: {
    action: VideoAutoProcessingAction.SPEED_UP,
    minDurationSeconds: 0.75,
    mergeGapSeconds: 0.5,
    shoulderSeconds: 0.4,
    speedUpPlaybackRate: 2.4,
  },
};
