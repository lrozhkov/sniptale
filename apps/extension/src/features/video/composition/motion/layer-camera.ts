import { VideoMotionOverlayZoomMode } from '../../project/types/index';
import type { VideoCompositionCameraState, VideoCompositionVisualLayer } from '../types';

export function shouldLockVisualLayerToViewport(
  layer: VideoCompositionVisualLayer,
  camera: VideoCompositionCameraState
): boolean {
  if (
    (camera.overlayZoomMode ?? VideoMotionOverlayZoomMode.LOCK_OVERLAYS) !==
    VideoMotionOverlayZoomMode.LOCK_OVERLAYS
  ) {
    return false;
  }

  switch (layer.kind) {
    case 'text':
    case 'annotation':
    case 'effect':
    case 'shape':
      return true;
    case 'video':
    case 'image':
      return false;
  }
}

export function mapVisualLayerToViewportSpace(
  layer: VideoCompositionVisualLayer,
  _camera: VideoCompositionCameraState
): VideoCompositionVisualLayer {
  return layer;
}

export function partitionVisualLayersByViewportLock(
  layers: VideoCompositionVisualLayer[],
  camera: VideoCompositionCameraState
): {
  locked: VideoCompositionVisualLayer[];
  unlocked: VideoCompositionVisualLayer[];
} {
  const locked: VideoCompositionVisualLayer[] = [];
  const unlocked: VideoCompositionVisualLayer[] = [];

  for (const layer of layers) {
    if (shouldLockVisualLayerToViewport(layer, camera)) {
      locked.push(layer);
      continue;
    }

    unlocked.push(layer);
  }

  return { locked, unlocked };
}

export function segmentVisualLayersByViewportLock(
  layers: VideoCompositionVisualLayer[],
  camera: VideoCompositionCameraState
): Array<{
  isLocked: boolean;
  layers: VideoCompositionVisualLayer[];
}> {
  const segments: Array<{
    isLocked: boolean;
    layers: VideoCompositionVisualLayer[];
  }> = [];

  for (const layer of layers) {
    const isLocked = shouldLockVisualLayerToViewport(layer, camera);
    const currentSegment = segments[segments.length - 1];

    if (!currentSegment || currentSegment.isLocked !== isLocked) {
      segments.push({ isLocked, layers: [layer] });
      continue;
    }

    currentSegment.layers.push(layer);
  }

  return segments;
}
