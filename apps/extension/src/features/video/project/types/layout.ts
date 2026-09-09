import type { Gradient } from '@sniptale/foundation/paint';

export const VideoTrackKind = {
  PRIMARY: 'PRIMARY',
  AUDIO: 'AUDIO',
  SUBTITLE: 'SUBTITLE',
} as const;

export type VideoTrackKind = (typeof VideoTrackKind)[keyof typeof VideoTrackKind];

/** Optional semantic purpose for a physical track; it does not change timeline mechanics. */
export const VideoProjectTrackRole = {
  CAMERA: 'CAMERA',
} as const;

export type VideoProjectTrackRole =
  (typeof VideoProjectTrackRole)[keyof typeof VideoProjectTrackRole];

export const VideoSubtitlePlacement = {
  TOP: 'TOP',
  BOTTOM: 'BOTTOM',
} as const;

export type VideoSubtitlePlacement =
  (typeof VideoSubtitlePlacement)[keyof typeof VideoSubtitlePlacement];

export const VideoSceneBackgroundKind = {
  SOLID: 'solid',
  GRADIENT: 'gradient',
  IMAGE: 'image',
} as const;

export type VideoSceneBackgroundKind =
  (typeof VideoSceneBackgroundKind)[keyof typeof VideoSceneBackgroundKind];

export const VideoSceneGradientAnimationMode = {
  NONE: 'none',
  ROTATE: 'rotate',
  BREATHE: 'breathe',
  DRIFT: 'drift',
  AUDIO_REACTIVE: 'audioReactive',
} as const;

export type VideoSceneGradientAnimationMode =
  (typeof VideoSceneGradientAnimationMode)[keyof typeof VideoSceneGradientAnimationMode];

export interface VideoSceneGradientAnimation {
  mode: VideoSceneGradientAnimationMode;
  speed: number;
  intensity: number;
}

export interface VideoProjectTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
}

export interface VideoProjectTextStyle {
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  color: string;
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  padding: number;
  borderRadius: number;
  lineHeight: number;
  textAlign: 'left' | 'center' | 'right';
}

export interface VideoProjectAnnotationStyle {
  accentColor: string;
  backgroundColor: string;
  headlineColor: string;
  sublineColor: string;
  badgeTextColor: string;
  borderRadius: number;
  padding: number;
  blurAmount: number;
  shimmerAmount: number;
  depthAmount: number;
}

export interface VideoProjectAnnotationTargetPoint {
  x: number;
  y: number;
}

export interface VideoProjectAnnotationTargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VideoProjectAnnotationLeaderLine {
  enabled: boolean;
  style: import('./templates').VideoAnnotationLeaderLineStyle;
  direction: import('./templates').VideoTemplateDirection;
  length: number;
  thickness: number;
}

export interface VideoProjectAnnotationCalloutDecor {
  arrowKind: import('./templates').VideoAnnotationArrowKind;
  markerKind: import('./templates').VideoAnnotationMarkerKind;
  frameKind: import('./templates').VideoAnnotationFrameKind;
  pulseKind: import('./templates').VideoAnnotationPulseKind;
}

export interface VideoProjectSubtitleTrackStyle extends VideoProjectTextStyle {
  maxWidthPercent: number;
  placement: VideoSubtitlePlacement;
  safeAreaPercent: number;
}

export interface VideoProjectShapeStyle {
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  borderRadius: number;
}

export interface VideoProjectTrack {
  id: string;
  name: string;
  order: number;
  isRoot?: boolean;
  visible: boolean;
  locked: boolean;
  kind: VideoTrackKind;
  role?: VideoProjectTrackRole;
  logicalLanes?: VideoProjectLogicalLane[];
  subtitleStyle?: VideoProjectSubtitleTrackStyle;
}

export interface VideoProjectLogicalLane {
  id: string;
}

export interface VideoProjectSolidBackground {
  kind: typeof VideoSceneBackgroundKind.SOLID;
  color: string;
}

export interface VideoProjectGradientBackground {
  kind: typeof VideoSceneBackgroundKind.GRADIENT;
  gradient: Gradient;
  animation?: VideoSceneGradientAnimation;
}

export interface VideoProjectImageBackground {
  kind: typeof VideoSceneBackgroundKind.IMAGE;
  assetId: string;
}

export type VideoProjectSceneBackground =
  | VideoProjectSolidBackground
  | VideoProjectGradientBackground
  | VideoProjectImageBackground;
