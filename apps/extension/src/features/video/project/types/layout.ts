import type { CameraBackgroundZoomBehavior } from '../motion/spatial';
import type { Gradient } from '@sniptale/foundation/paint';

/** Controls whether retained content extends the montage clock. */
export const VideoProjectDurationMode = {
  CONTENT: 'content',
  PROJECT: 'project',
} as const;

export type VideoProjectDurationMode =
  (typeof VideoProjectDurationMode)[keyof typeof VideoProjectDurationMode];

/** Admits only the two serialized policies shared by retained audio and text. */
export function isVideoProjectDurationMode(value: unknown): value is VideoProjectDurationMode {
  return value === VideoProjectDurationMode.CONTENT || value === VideoProjectDurationMode.PROJECT;
}

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
  /** Independent AUDIO track master; omission means unity. */
  audioVolume?: number;
  effectsBypassed?: boolean;
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
  imageFit?: 'cover' | 'contain';
}

export interface VideoProjectBackgroundVariants {
  solid?: VideoProjectSolidBackground;
  gradient?: VideoProjectGradientBackground;
  image?: VideoProjectImageBackground;
}

export type VideoProjectSceneBackground = (
  | VideoProjectSolidBackground
  | VideoProjectGradientBackground
  | VideoProjectImageBackground
) & {
  /** Disabled paint retains its authored variants without entering composition. */
  enabled?: false;
  blur?: number;
  /** Passive legacy layout blur when a distinct active layout also exists. */
  rememberedBlur?: number;
  /** Window is the Native default; Gallery defaults are explicit after conversion. */
  zoomBehavior?: CameraBackgroundZoomBehavior;
  remembered?: VideoProjectBackgroundVariants;
};
