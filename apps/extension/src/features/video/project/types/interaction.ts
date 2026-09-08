export const VideoProjectSourceKind = {
  MANUAL: 'manual',
  RECORDING: 'recording',
  SCENARIO: 'scenario',
} as const;

export type VideoProjectSourceKind =
  (typeof VideoProjectSourceKind)[keyof typeof VideoProjectSourceKind];

export const VideoCursorCaptureMode = {
  SEPARATE: 'separate',
  EMBEDDED_FALLBACK: 'embedded-fallback',
} as const;

export type VideoCursorCaptureMode =
  (typeof VideoCursorCaptureMode)[keyof typeof VideoCursorCaptureMode];

export const VideoCursorVisualPreset = {
  ARROW: 'ARROW',
  DOT: 'DOT',
  RING: 'RING',
  CROSSHAIR: 'CROSSHAIR',
} as const;

export type VideoCursorVisualPreset =
  (typeof VideoCursorVisualPreset)[keyof typeof VideoCursorVisualPreset];

export const VideoCursorAnimationPreset = {
  NONE: 'NONE',
  PULSE: 'PULSE',
  FLOAT: 'FLOAT',
  BREATHE: 'BREATHE',
} as const;

export type VideoCursorAnimationPreset =
  (typeof VideoCursorAnimationPreset)[keyof typeof VideoCursorAnimationPreset];

export const VideoTemporalEasing = {
  LINEAR: 'LINEAR',
  EASE_OUT: 'EASE_OUT',
  EASE_IN_OUT: 'EASE_IN_OUT',
  INSTANT: 'INSTANT',
} as const;

export type VideoTemporalEasing = (typeof VideoTemporalEasing)[keyof typeof VideoTemporalEasing];

export const VideoMotionFocusMode = {
  MANUAL: 'MANUAL',
  MANUAL_AREA: 'MANUAL_AREA',
  CURSOR: 'CURSOR',
  ACTION: 'ACTION',
} as const;

export type VideoMotionFocusMode = (typeof VideoMotionFocusMode)[keyof typeof VideoMotionFocusMode];

export const VideoMotionOverlayZoomMode = {
  LOCK_OVERLAYS: 'LOCK_OVERLAYS',
  FOLLOW_CAMERA: 'FOLLOW_CAMERA',
} as const;

export type VideoMotionOverlayZoomMode =
  (typeof VideoMotionOverlayZoomMode)[keyof typeof VideoMotionOverlayZoomMode];

export const VideoProjectActionEventKind = {
  CLICK: 'CLICK',
  SCROLL: 'SCROLL',
  KEY: 'KEY',
  PAUSE: 'PAUSE',
  CALLOUT: 'CALLOUT',
} as const;

export type VideoProjectActionEventKind =
  (typeof VideoProjectActionEventKind)[keyof typeof VideoProjectActionEventKind];

export const VideoProjectActionPreset = {
  NONE: 'NONE',
  CLICK_RIPPLE: 'CLICK_RIPPLE',
  SPOTLIGHT: 'SPOTLIGHT',
  DWELL_ZOOM: 'DWELL_ZOOM',
  SCROLL_EMPHASIS: 'SCROLL_EMPHASIS',
} as const;

export type VideoProjectActionPreset =
  (typeof VideoProjectActionPreset)[keyof typeof VideoProjectActionPreset];

export type VideoProjectSource =
  | {
      kind: typeof VideoProjectSourceKind.MANUAL;
    }
  | {
      kind: typeof VideoProjectSourceKind.RECORDING;
      recordingId: string;
    }
  | {
      kind: typeof VideoProjectSourceKind.SCENARIO;
      scenarioProjectId: string;
    };

/**
 * Immutable recording provenance for an interaction whose rendered `time` is projected into the
 * editable project timeline. `sourceClipId` keeps duplicated uses of the same source range from
 * stealing the interaction; split operations may migrate it to the newly created trailing clip.
 */
export interface VideoProjectSourceTimeAnchor {
  kind: 'recording-source';
  recordingId: string;
  sourceClipId: string;
  sourceTime: number;
}

export const VideoProjectInteractionTimeBasis = {
  PROJECT: 'project',
} as const;

export type VideoProjectInteractionTimeBasis =
  (typeof VideoProjectInteractionTimeBasis)[keyof typeof VideoProjectInteractionTimeBasis];

export interface VideoProjectCursorSample {
  /** Retained normalized interval of the easing curve toward the following key. */
  interpolationRange?: { start: number; end: number };
  id: string;
  interpolation?: VideoTemporalEasing;
  skinOverride?: VideoProjectCursorSkin | null;
  sourceAnchor?: VideoProjectSourceTimeAnchor;
  timeBasis?: VideoProjectInteractionTimeBasis;
  time: number;
  x: number;
  y: number;
  visible: boolean;
}

export interface VideoProjectCursorSkin {
  animationPreset: VideoCursorAnimationPreset;
  color: string;
  hidden: boolean;
  preset: VideoCursorVisualPreset;
  scale: number;
  shadow: boolean;
}

export interface VideoProjectCursorTrack {
  captureMode: VideoCursorCaptureMode;
  samples: VideoProjectCursorSample[];
  skin: VideoProjectCursorSkin;
}

export interface VideoProjectActionPoint {
  x: number;
  y: number;
}

/** Project-wide presentation defaults; captured event facts remain independent. */
export interface VideoProjectActionPresentation {
  enabled: boolean;
  clickPreset: VideoProjectActionPreset;
  duration: number;
  offset: number;
  clickSuppressionInterval: number;
  showKeystrokes: boolean;
}

/** Missing properties inherit the current project presentation defaults. */
export interface VideoProjectActionPresentationOverride {
  enabled?: boolean;
  preset?: VideoProjectActionPreset;
  duration?: number;
  offset?: number;
  point?: VideoProjectActionPoint;
}

/** Raw recording telemetry. Its clock and coordinates belong to the capture. */
export type RecordingViewportGeometry = Readonly<{
  width: number;
  height: number;
  devicePixelRatio: number;
  visualViewportScale: number;
  visualViewportOffsetX: number;
  visualViewportOffsetY: number;
}>;

export type RecordingViewportObservation = Readonly<{
  initial: RecordingViewportGeometry;
  stable: boolean;
}>;

export type RecordingPointTransform = Readonly<{
  viewport: RecordingViewportGeometry;
  visibleClientRect: Readonly<{ x: number; y: number; width: number; height: number }>;
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
}>;

export interface RecordingActionEvent {
  readonly recordingPoint?: Readonly<{ x: number; y: number }> | null;
  animation?: { start: number; end: number; duration: number };
  id: string;
  kind: VideoProjectActionEventKind;
  time: number;
  duration: number;
  point: VideoProjectActionPoint | null;
  label: string;
  data: Record<string, string | number | boolean | null>;
  preset: VideoProjectActionPreset;
  sourceAnchor?: VideoProjectSourceTimeAnchor;
  timeBasis?: VideoProjectInteractionTimeBasis;
}

/** Capture facts after explicit source geometry projection; point is normalized [0, 1] or unavailable. */
export type SourceNormalizedRecordingActionEvent = Pick<
  RecordingActionEvent,
  'id' | 'kind' | 'time' | 'duration' | 'point' | 'label' | 'data' | 'preset'
>;

export type VideoProjectActionAnchor =
  | { kind: 'project'; time: number }
  | {
      kind: 'recording-source';
      recordingId: string;
      sourceInstanceId: string;
      sourceEventId: string;
      sourceTime: number;
    };

/** Authored fact; visible occurrences are derived from the current source fragments. */
export interface VideoProjectActionEvent {
  id: string;
  anchor: VideoProjectActionAnchor;
  kind: VideoProjectActionEventKind;
  label: string;
  data: Record<string, string | number | boolean | null>;
  point: VideoProjectActionPoint | null;
  capturedDuration?: number;
  presentation?: VideoProjectActionPresentationOverride;
}

export const RecordingTelemetrySignalKind = {
  TYPING: 'typing',
  CURSOR_IDLE: 'cursor-idle',
  STATIC_FRAME: 'static-frame',
} as const;

export type RecordingTelemetrySignalKind =
  (typeof RecordingTelemetrySignalKind)[keyof typeof RecordingTelemetrySignalKind];

export interface RecordingTelemetrySignal {
  id: string;
  kind: RecordingTelemetrySignalKind;
  startTime: number;
  endTime: number;
  point: VideoProjectActionPoint | null;
  data: Record<string, string | number | boolean | null>;
}

export interface VideoProjectMotionPoint {
  x: number;
  y: number;
}

export interface VideoProjectMotionArea {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface VideoProjectMotionRegion {
  /** Authored interval tied to one source clip, retained while its visible part is trimmed. */
  sourceBinding?: {
    animationGroupId?: string;
    clipId: string;
    sourceStart: number;
    sourceEnd: number;
    animation: { start: number; end: number; duration: number };
  };
  /** Transition from the preceding held state; timing is derived from both endpoints. */
  incomingConnection?: { fromRegionId: string; easing: VideoTemporalEasing } | null;
  /** Retained interval within the original zoom animation, independent of timeline placement. */
  animation?: { start: number; end: number; duration: number };

  duration: number;
  easing: VideoTemporalEasing;
  focusArea?: VideoProjectMotionArea | null;
  focusMode: VideoMotionFocusMode;
  focusPoint: VideoProjectMotionPoint | null;
  id: string;
  motionBlurAmount?: number;
  overlayZoomMode?: VideoMotionOverlayZoomMode;

  scale: number;
  startTime: number;
  targetAction: { eventId: string; clipId: string | null } | null;
  zoomInDuration: number;
  zoomOutDuration: number;
}
