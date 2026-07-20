import { VIDEO_EDITOR_PLAYBACK_RATE_MAX, VIDEO_EDITOR_PLAYBACK_RATE_MIN } from './playback-rate';

export const VIDEO_CLIP_PROPERTY_LIMITS = {
  annotationDurationMs: { max: 5000, min: 0 },
  annotationEffectAmount: { max: 1, min: 0 },
  annotationLeaderLength: { max: 7680, min: 0 },
  annotationLeaderThickness: { max: 32, min: 1 },
  annotationPadding: { max: 80, min: 0 },
  annotationRadius: { max: 64, min: 0 },
  annotationTargetCoordinate: { max: 7680, min: 0 },
  annotationTargetSize: { max: 7680, min: 0 },
  fadeMs: { max: 5000, min: 0 },
  fitScalePercent: { max: 300, min: 10 },
  shapeRadius: { max: 100, min: 0 },
  shapeStrokeWidth: { max: 32, min: 0 },
  textBorderWidth: { max: 32, min: 0 },
  textFontSize: { max: 160, min: 10 },
  textFontWeight: { max: 900, min: 100 },
  textLineHeight: { max: 2.4, min: 0.8 },
  textPadding: { max: 80, min: 0 },
  transformCoordinate: { max: 7680, min: -7680 },
  transformOpacity: { max: 1, min: 0 },
  transformRotation: { max: 360, min: -360 },
  transformSize: { max: 7680, min: 40 },
  playbackRate: { max: VIDEO_EDITOR_PLAYBACK_RATE_MAX, min: VIDEO_EDITOR_PLAYBACK_RATE_MIN },
} as const;

type VideoNumberLimit = {
  max: number;
  min: number;
};

export function clampVideoPropertyNumber(value: number, limit: VideoNumberLimit): number {
  if (!Number.isFinite(value)) {
    return limit.min;
  }

  return Math.min(Math.max(value, limit.min), limit.max);
}
