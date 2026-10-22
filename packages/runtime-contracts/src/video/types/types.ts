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

export const VideoRecordingFailureCode = {
  CAMERA_FRAME_RATE_UNSUPPORTED: 'camera-frame-rate-unsupported',
} as const;

export type VideoRecordingFailureCode =
  (typeof VideoRecordingFailureCode)[keyof typeof VideoRecordingFailureCode];

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

/** Appearance of page-local recording effects; does not replace the native cursor. */
export interface VideoCursorEffectSettings {
  haloSize: number;
  haloOpacity: number;
  dimmingRadius: number;
  dimmingOpacity: number;
  clickSize: number;
  clickDuration: number;
  haloColor?: string;
  dimmingColor?: string;
  clickColor?: string;
  clickEffect?: 'ripple' | 'press' | 'glow';
  clickEasing?: 'linear' | 'ease-out' | 'ease-in-out';
  clickStroke?: number;
  clickPulses?: number;
  haloStroke?: number;
  haloGlow?: number;
}

export const DEFAULT_VIDEO_CURSOR_EFFECTS: Readonly<VideoCursorEffectSettings> = {
  haloSize: 34,
  haloOpacity: 100,
  dimmingRadius: 54,
  dimmingOpacity: 34,
  clickSize: 44,
  clickDuration: 420,
  clickEffect: 'ripple',
  clickEasing: 'ease-out',
  clickStroke: 2,
  clickPulses: 1,
  haloStroke: 2,
  haloGlow: 8,
};

export const VIDEO_CURSOR_EFFECT_LIMITS = {
  haloSize: [20, 120],
  haloOpacity: [10, 100],
  dimmingRadius: [30, 240],
  dimmingOpacity: [0, 80],
  clickSize: [16, 120],
  clickDuration: [150, 1200],
  clickStroke: [0.5, 8],
  clickPulses: [1, 5],
  haloStroke: [0.5, 8],
  haloGlow: [0, 40],
} as const;

function isCursorEffectNumber(value: unknown, bounds: readonly [number, number]): boolean {
  return (
    typeof value === 'number' && Number.isFinite(value) && value >= bounds[0] && value <= bounds[1]
  );
}

function isCursorEffectColor(value: unknown): boolean {
  return typeof value === 'string' && /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value);
}

/** Reject incomplete, unknown, or out-of-range appearance values at data boundaries. */
export function isVideoCursorEffectSettings(value: unknown): value is VideoCursorEffectSettings {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length >= 6 &&
    Object.keys(value).length <= 15 &&
    Object.keys(value).every(
      (key) =>
        Object.hasOwn(VIDEO_CURSOR_EFFECT_LIMITS, key) ||
        ['haloColor', 'dimmingColor', 'clickColor', 'clickEffect', 'clickEasing'].includes(key)
    ) &&
    (!('haloColor' in value) || isCursorEffectColor(value.haloColor)) &&
    (!('dimmingColor' in value) || isCursorEffectColor(value.dimmingColor)) &&
    (!('clickColor' in value) || isCursorEffectColor(value.clickColor)) &&
    (!('clickEffect' in value) ||
      (typeof value.clickEffect === 'string' &&
        ['ripple', 'press', 'glow'].includes(value.clickEffect))) &&
    (!('clickEasing' in value) ||
      (typeof value.clickEasing === 'string' &&
        ['linear', 'ease-out', 'ease-in-out'].includes(value.clickEasing))) &&
    (!('clickStroke' in value) ||
      isCursorEffectNumber(value.clickStroke, VIDEO_CURSOR_EFFECT_LIMITS.clickStroke)) &&
    (!('clickPulses' in value) ||
      (Number.isInteger(value.clickPulses) &&
        isCursorEffectNumber(value.clickPulses, VIDEO_CURSOR_EFFECT_LIMITS.clickPulses))) &&
    (!('haloStroke' in value) ||
      isCursorEffectNumber(value.haloStroke, VIDEO_CURSOR_EFFECT_LIMITS.haloStroke)) &&
    (!('haloGlow' in value) ||
      isCursorEffectNumber(value.haloGlow, VIDEO_CURSOR_EFFECT_LIMITS.haloGlow)) &&
    'haloSize' in value &&
    isCursorEffectNumber(value.haloSize, VIDEO_CURSOR_EFFECT_LIMITS.haloSize) &&
    'haloOpacity' in value &&
    isCursorEffectNumber(value.haloOpacity, VIDEO_CURSOR_EFFECT_LIMITS.haloOpacity) &&
    'dimmingRadius' in value &&
    isCursorEffectNumber(value.dimmingRadius, VIDEO_CURSOR_EFFECT_LIMITS.dimmingRadius) &&
    'dimmingOpacity' in value &&
    isCursorEffectNumber(value.dimmingOpacity, VIDEO_CURSOR_EFFECT_LIMITS.dimmingOpacity) &&
    'clickSize' in value &&
    isCursorEffectNumber(value.clickSize, VIDEO_CURSOR_EFFECT_LIMITS.clickSize) &&
    'clickDuration' in value &&
    isCursorEffectNumber(value.clickDuration, VIDEO_CURSOR_EFFECT_LIMITS.clickDuration)
  );
}

export interface VideoRecordingSurfaceSettings {
  toolbarEnabled: boolean;
  cursorSpotlightEnabled: boolean;
  cursorDimmingEnabled?: boolean;
  cursorClickAnimationEnabled?: boolean;
  cursorEffects?: VideoCursorEffectSettings;
}

export const WEBCAM_DOCK_POSITIONS = [
  'nw',
  'n',
  'ne',
  'w',
  'e',
  'sw',
  's',
  'se',
  'n25',
  'n75',
  's25',
  's75',
  'w25',
  'w75',
  'e25',
  'e75',
] as const;
export type WebcamDockPosition = (typeof WEBCAM_DOCK_POSITIONS)[number];

/** Admits only supported camera edge and corner anchors. */
export function isWebcamDockPosition(value: unknown): value is WebcamDockPosition {
  return WEBCAM_DOCK_POSITIONS.some((position) => position === value);
}

export interface WebcamPresentationSettings {
  mode: WebcamPresentationMode;
  /** Missing or false enables anchored placement. */
  freePlacement?: boolean;
  /** Controls anchored geometry. Missing values preserve the legacy center quadrant. */
  dockPosition?: WebcamDockPosition;
  shape: WebcamPresentationShape;
  center: { x: number; y: number };
  sizeFraction: number;
  cropOffset: { x: number; y: number };
}

export interface VideoRecordingSettings {
  microphoneEnabled: boolean;
  warnWithoutMicrophone?: boolean;
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

export interface VideoRecordingCompletionState {
  discard: boolean;
  outcome: 'unknown' | 'stopped' | 'failed';
  pending: boolean;
}

/** Transient microphone-only signal observation. This value does not identify speech or retain audio. */
export interface VideoMicrophoneActivity {
  status: 'disabled' | 'unavailable' | 'ready';
  level: number;
  warning: boolean;
}

export interface VideoRecordingRuntimeState {
  outputProfile?: VideoOutputProfile | null;
  microphoneActivity?: VideoMicrophoneActivity | null;
  completion?: VideoRecordingCompletionState | null;
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
