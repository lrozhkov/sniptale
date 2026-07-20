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
  shadowIntensity?: number;
  shadowMode?: VideoMediaShadowMode;
}

export interface VideoProjectMediaVisualFields extends VideoProjectMediaShadowFields {
  fitMode: VideoMediaFitMode;
  fitScalePercent?: number;
}
