// Types shared across video recording contracts, messages, and annotations.

import type { NativeCaptureSettings } from './native-settings';
import type { VideoOutputProfile } from './output-profile';
import type { VideoRecordingProfile } from './quality-profiles';

export type * from './native-settings';
export * from './output-profile';
export * from './quality';
export * from './quality-profiles';

export const CaptureMode = {
  TAB: 'TAB',
  TAB_CROP: 'TAB_CROP',
  CAMERA: 'CAMERA',
  SCREEN: 'SCREEN',
} as const;

export type CaptureMode = (typeof CaptureMode)[keyof typeof CaptureMode];

export const VideoDisplaySurface = {
  BROWSER: 'browser',
  MONITOR: 'monitor',
  WINDOW: 'window',
} as const;

export type VideoDisplaySurface = (typeof VideoDisplaySurface)[keyof typeof VideoDisplaySurface];

export interface CaptureSource {
  mode: CaptureMode;
  streamId: string;
  tabId?: number;
  tabTitle?: string;
  tabUrl?: string;
  tabFavicon?: string;
  cropRegion?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  captureViewport?: ViewportInfo;
  cameraDeviceId?: string | null;
  screenName?: string;
}

export const VideoRecordingStatus = {
  IDLE: 'IDLE',
  PREPARING: 'PREPARING',
  COUNTDOWN: 'COUNTDOWN',
  RECORDING: 'RECORDING',
  PAUSED: 'PAUSED',
  STOPPING: 'STOPPING',
} as const;

export type VideoRecordingStatus = (typeof VideoRecordingStatus)[keyof typeof VideoRecordingStatus];

export type VideoPostRecordResult = {
  primaryRecordingId: string;
  projectId: string | null;
  recordingId: string;
};

export const WebcamResolutionPreset = {
  AUTO: 'AUTO',
  P720: '720P',
  P1080: '1080P',
  P1440: '1440P',
  P4K: '4K',
} as const;

export type WebcamResolutionPreset =
  (typeof WebcamResolutionPreset)[keyof typeof WebcamResolutionPreset];

export const WebcamFrameRatePreset = {
  AUTO: 'AUTO',
  FPS30: '30',
  FPS60: '60',
} as const;

export type WebcamFrameRatePreset =
  (typeof WebcamFrameRatePreset)[keyof typeof WebcamFrameRatePreset];

export interface WebcamQualitySettings {
  frameRate: WebcamFrameRatePreset;
  resolution: WebcamResolutionPreset;
}

export interface WebcamActualSettings {
  frameRate?: number;
  height?: number;
  width?: number;
}

export type MicrophoneProcessingSetting =
  | 'echoCancellation'
  | 'noiseSuppression'
  | 'autoGainControl';

export interface MicrophoneActualSettings {
  autoGainControl?: boolean;
  channelCount?: number;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  sampleRate?: number;
}

export const VIDEO_SOURCE_COUNT_MIN = 1;
export const VIDEO_SOURCE_COUNT_MAX = 3;

export const VideoRecordingAudioMode = {
  EMBEDDED: 'embedded',
  SEPARATE_MIC_TRACK: 'separate-mic-track',
} as const;

export type VideoRecordingAudioMode =
  (typeof VideoRecordingAudioMode)[keyof typeof VideoRecordingAudioMode];

export const VIDEO_AUTO_FADE_DELAYS = [0, 3, 5, 10, 30] as const;

export type VideoAutoFadeDelay = (typeof VIDEO_AUTO_FADE_DELAYS)[number];

export const WebcamPresentationMode = {
  EMBEDDED: 'embedded',
  SEPARATE_TRACK: 'separate-track',
} as const;

export type WebcamPresentationMode =
  (typeof WebcamPresentationMode)[keyof typeof WebcamPresentationMode];

export const WebcamPresentationShape = {
  CIRCLE: 'circle',
  RECTANGLE: 'rectangle',
} as const;

export type WebcamPresentationShape =
  (typeof WebcamPresentationShape)[keyof typeof WebcamPresentationShape];

export interface VideoRecordingSurfaceSettings {
  toolbarEnabled: boolean;
  cursorSpotlightEnabled: boolean;
  cursorDimmingEnabled?: boolean;
  cursorClickAnimationEnabled?: boolean;
}

export interface WebcamPresentationSettings {
  mode: WebcamPresentationMode;
  shape: WebcamPresentationShape;
  center: { x: number; y: number };
  sizeFraction: number;
  cropOffset: { x: number; y: number };
}

export interface VideoRecordingSettings {
  microphoneEnabled: boolean;
  microphoneDeviceId: string | null;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  microphoneGain?: number;
  webcamEnabled?: boolean;
  webcamDeviceId?: string | null;
  webcamQuality?: WebcamQualitySettings;
  systemAudioEnabled: boolean;
  sourceCount?: number;
  outputProfile: VideoOutputProfile;
  qualityProfileId: string | null;
  qualityProfiles: VideoRecordingProfile[];
  countdownSeconds: number;
  autoFadeDelay: number;
  interactionDiagnosticsEnabled: boolean;
  controlledCursorCaptureEnabled?: boolean;
  recordingSurface?: VideoRecordingSurfaceSettings;
  webcamPresentation?: WebcamPresentationSettings;
  native?: NativeCaptureSettings;
}

export interface VideoRecordingLiveMediaState {
  microphoneDeviceId: string | null;
  microphoneEnabled: boolean;
  microphoneSelected: boolean;
  webcamDeviceId: string | null;
  webcamEnabled: boolean;
  webcamSettings?: WebcamActualSettings | null;
  webcamSelected: boolean;
}

export function createVideoRecordingLiveMediaState(
  settings: VideoRecordingSettings
): VideoRecordingLiveMediaState {
  const microphoneSelected = settings.microphoneEnabled === true;
  const webcamSelected = settings.webcamEnabled === true;

  return {
    microphoneDeviceId: settings.microphoneDeviceId,
    microphoneEnabled: microphoneSelected,
    microphoneSelected,
    webcamDeviceId: settings.webcamDeviceId ?? null,
    webcamEnabled: webcamSelected,
    webcamSettings: null,
    webcamSelected,
  };
}

export function updateVideoRecordingLiveMediaState(
  current: VideoRecordingLiveMediaState | null | undefined,
  patch: Pick<
    Partial<VideoRecordingSettings>,
    'microphoneDeviceId' | 'microphoneEnabled' | 'webcamDeviceId' | 'webcamEnabled'
  >
): VideoRecordingLiveMediaState | null {
  if (!current) {
    return null;
  }

  return {
    ...current,
    ...(patch.microphoneDeviceId === undefined
      ? {}
      : { microphoneDeviceId: patch.microphoneDeviceId }),
    ...(patch.microphoneEnabled === undefined
      ? {}
      : { microphoneEnabled: patch.microphoneEnabled }),
    ...(patch.webcamDeviceId === undefined ? {} : { webcamDeviceId: patch.webcamDeviceId }),
    ...(patch.webcamEnabled === undefined ? {} : { webcamEnabled: patch.webcamEnabled }),
  };
}

export function normalizeVideoSourceCount(sourceCount: unknown): number {
  if (typeof sourceCount !== 'number' || !Number.isFinite(sourceCount)) {
    return VIDEO_SOURCE_COUNT_MIN;
  }

  return Math.max(
    VIDEO_SOURCE_COUNT_MIN,
    Math.min(VIDEO_SOURCE_COUNT_MAX, Math.floor(sourceCount))
  );
}

export function resolveVideoRecordingAudioMode(
  settings: Pick<VideoRecordingSettings, 'sourceCount'>
): VideoRecordingAudioMode {
  return normalizeVideoSourceCount(settings.sourceCount) === 1
    ? VideoRecordingAudioMode.EMBEDDED
    : VideoRecordingAudioMode.SEPARATE_MIC_TRACK;
}

export const VideoAutoProcessingAction = {
  SPEED_UP: 'speed-up',
  REMOVE: 'remove',
  SKIP: 'skip',
} as const;

export type VideoAutoProcessingAction =
  (typeof VideoAutoProcessingAction)[keyof typeof VideoAutoProcessingAction];

export interface VideoAutoProcessingStableSegmentsSettings {
  action: VideoAutoProcessingAction;
  minDurationSeconds: number;
  mergeGapSeconds: number;
  shoulderSeconds: number;
  speedUpPlaybackRate: number;
}

export interface VideoAutoProcessingSettings {
  enabled: boolean;
  stableSegments: VideoAutoProcessingStableSegmentsSettings;
}

export interface SelectedArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VideoRecordingState {
  status: VideoRecordingStatus;
  duration: number;
  settings: VideoRecordingSettings;
  startTime?: number;
}

export interface VideoRecordingRuntimeState {
  status: VideoRecordingStatus;
  duration: number;
  countdownEndsAt: number | null;
  captureMode: CaptureMode | null;
  captureSource: CaptureSource | null;
  cropRegion?: SelectedArea | null;
  viewportPresetId: string | null;
  liveMedia?: VideoRecordingLiveMediaState | null;
  error: string | null;
}

export interface VideoRecordingUiState {
  captureMode: CaptureMode;
  viewportPresetId: string | null;
}

export interface ViewportInfo {
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  devicePixelRatio: number;
  outerWidth?: number;
  outerHeight?: number;
  viewportOffsetX?: number;
  viewportOffsetY?: number;
  visualViewportScale?: number;
}
