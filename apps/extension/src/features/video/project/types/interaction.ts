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

export const VideoMotionCameraMode = {
  STATIC: 'STATIC',
  PATH: 'PATH',
} as const;

export type VideoMotionCameraMode =
  (typeof VideoMotionCameraMode)[keyof typeof VideoMotionCameraMode];

export const VideoMotionPathTargetKind = {
  POINT: 'POINT',
  AREA: 'AREA',
} as const;

export type VideoMotionPathTargetKind =
  (typeof VideoMotionPathTargetKind)[keyof typeof VideoMotionPathTargetKind];

export const VideoMotionPathTrajectoryPreset = {
  LINEAR: 'LINEAR',
  SOFT_ARC: 'SOFT_ARC',
} as const;

export type VideoMotionPathTrajectoryPreset =
  (typeof VideoMotionPathTrajectoryPreset)[keyof typeof VideoMotionPathTrajectoryPreset];

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

export interface VideoProjectCursorSample {
  id: string;
  interpolation?: VideoTemporalEasing;
  skinOverride?: VideoProjectCursorSkin | null;
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

export interface VideoProjectActionEvent {
  id: string;
  kind: VideoProjectActionEventKind;
  time: number;
  duration: number;
  point: VideoProjectActionPoint | null;
  label: string;
  data: Record<string, string | number | boolean | null>;
  preset: VideoProjectActionPreset;
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

export interface VideoProjectMotionPathPointTarget {
  kind: typeof VideoMotionPathTargetKind.POINT;
  scale: number;
  x: number;
  y: number;
}

export interface VideoProjectMotionPathAreaTarget {
  height: number;
  kind: typeof VideoMotionPathTargetKind.AREA;
  width: number;
  x: number;
  y: number;
}

export type VideoProjectMotionPathTarget =
  | VideoProjectMotionPathAreaTarget
  | VideoProjectMotionPathPointTarget;

export interface VideoProjectMotionPathStop {
  id: string;
  offset: number;
  target: VideoProjectMotionPathTarget;
}

export interface VideoProjectMotionPathSegment {
  durationWeight: number;
  easing: VideoTemporalEasing;
  trajectoryPreset: VideoMotionPathTrajectoryPreset;
}

export interface VideoProjectMotionPath {
  segments: VideoProjectMotionPathSegment[];
  stops: VideoProjectMotionPathStop[];
}

export interface VideoProjectMotionRegion {
  cameraMode?: VideoMotionCameraMode;
  duration: number;
  easing: VideoTemporalEasing;
  focusArea?: VideoProjectMotionArea | null;
  focusMode: VideoMotionFocusMode;
  focusPoint: VideoProjectMotionPoint | null;
  id: string;
  motionBlurAmount?: number;
  overlayZoomMode?: VideoMotionOverlayZoomMode;
  path?: VideoProjectMotionPath | null;
  scale: number;
  startTime: number;
  targetActionEventId: string | null;
  zoomInDuration: number;
  zoomOutDuration: number;
}
