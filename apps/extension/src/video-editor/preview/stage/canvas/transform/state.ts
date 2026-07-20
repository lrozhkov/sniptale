import type { VideoProjectTransform } from '../../../../../features/video/project/types';

export interface PreviewTransformClientPoint {
  clientX: number;
  clientY: number;
}

export interface PreviewTransformGestureState {
  activated: boolean;
  animationFrameId: number | null;
  authoritativeTransform: VideoProjectTransform;
  clipId: string;
  finished: boolean;
  latestPoint: PreviewTransformClientPoint;
  origin: PreviewTransformClientPoint;
  previewTransform: VideoProjectTransform | null;
}

const PREVIEW_TRANSFORM_ACTIVATION_THRESHOLD = 2;

export function hasCrossedPreviewTransformThreshold(
  origin: PreviewTransformClientPoint,
  point: PreviewTransformClientPoint
): boolean {
  return (
    Math.hypot(point.clientX - origin.clientX, point.clientY - origin.clientY) >=
    PREVIEW_TRANSFORM_ACTIVATION_THRESHOLD
  );
}

export function createPreviewTransformGestureState(params: {
  clipId: string;
  origin: PreviewTransformClientPoint;
  transform: VideoProjectTransform;
}): PreviewTransformGestureState {
  return {
    activated: false,
    animationFrameId: null,
    authoritativeTransform: { ...params.transform },
    clipId: params.clipId,
    finished: false,
    latestPoint: { ...params.origin },
    origin: { ...params.origin },
    previewTransform: null,
  };
}
