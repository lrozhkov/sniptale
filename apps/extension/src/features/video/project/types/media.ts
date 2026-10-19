import type { MediaSourceCrop } from '../media-crop';
import type { WindowHeader } from '@sniptale/runtime-contracts/window-header';

/** Bounded, source-time amplitude envelope stored with each media asset. */
export const MAX_VIDEO_PROJECT_AUDIO_PEAKS = 30_000;

export const VideoMediaFitMode = {
  CONTAIN: 'CONTAIN',
  SOURCE_100: 'SOURCE_100',
  FIT_LONG_SIDE: 'FIT_LONG_SIDE',
  FIT_SHORT_SIDE: 'FIT_SHORT_SIDE',
  COVER: 'COVER',
  STRETCH: 'STRETCH',
} as const;

export type VideoMediaFitMode = (typeof VideoMediaFitMode)[keyof typeof VideoMediaFitMode];

export const VideoMediaShadowMode = {
  BACKDROP: 'BACKDROP',
  GLOW: 'GLOW',
} as const;

export type VideoMediaShadowMode = (typeof VideoMediaShadowMode)[keyof typeof VideoMediaShadowMode];

export interface VideoProjectMediaShadowFields {
  /** Authored window color remains available when shadow intensity is zero. */
  shadowColor?: string;
  shadowIntensity?: number;
  shadowMode?: VideoMediaShadowMode;
}

export interface VideoProjectMediaVisualFields extends VideoProjectMediaShadowFields {
  /** Original-source crop; clip placement and source timing remain independent. */
  sourceCrop?: MediaSourceCrop;
  /** Logical project pixels; camera tracks retain this setting without applying it. */
  windowCornerRadius?: number;
  windowHeader?: WindowHeader;
  fitMode: VideoMediaFitMode;
  fitScalePercent?: number;
}
