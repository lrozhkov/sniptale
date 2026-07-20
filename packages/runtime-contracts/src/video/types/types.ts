// Types shared across video recording contracts, messages, and annotations.

import type { NativeCaptureSettings } from './native-settings';

export type * from './native-settings';

export const CaptureMode = {
  TAB: 'TAB',
  TAB_CROP: 'TAB_CROP',
  CAMERA: 'CAMERA',
  SCREEN: 'SCREEN',
  VIEWPORT_EMULATION: 'VIEWPORT_EMULATION',
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

export const VideoQuality = {
  ULTRA: 'ULTRA',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
} as const;

export type VideoQuality = (typeof VideoQuality)[keyof typeof VideoQuality];

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
  quality: VideoQuality;
  countdownSeconds: number;
  autoFadeDelay: number;
  openEditorAfterRecording: boolean;
  diagnosticsEnabled: boolean;
  controlledCursorCaptureEnabled?: boolean;
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
  patch: Pick<Partial<VideoRecordingSettings>, 'microphoneEnabled' | 'webcamEnabled'>
): VideoRecordingLiveMediaState | null {
  if (!current) {
    return null;
  }

  return {
    ...current,
    ...(patch.microphoneEnabled === undefined
      ? {}
      : { microphoneEnabled: patch.microphoneEnabled }),
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

export interface VideoViewportPresetSelection {
  id?: string;
  width: number;
  height: number;
  label?: string;
}

export interface VideoRecordingRuntimeState {
  status: VideoRecordingStatus;
  duration: number;
  countdownEndsAt: number | null;
  captureMode: CaptureMode | null;
  captureSource: CaptureSource | null;
  viewportPreset: VideoViewportPresetSelection | null;
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
}
