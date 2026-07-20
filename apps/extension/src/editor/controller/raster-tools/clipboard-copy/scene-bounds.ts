import type { RasterClipboardPayload } from '../clipboard-types';

export function mapMaskBoundsToScene(
  snapshot: { bitmap: HTMLCanvasElement; sceneBounds: RasterClipboardPayload['sceneBounds'] },
  bounds: { left: number; top: number; width: number; height: number }
): RasterClipboardPayload['sceneBounds'] {
  return {
    left:
      snapshot.sceneBounds.left +
      (bounds.left / snapshot.bitmap.width) * snapshot.sceneBounds.width,
    top:
      snapshot.sceneBounds.top +
      (bounds.top / snapshot.bitmap.height) * snapshot.sceneBounds.height,
    width: (bounds.width / snapshot.bitmap.width) * snapshot.sceneBounds.width,
    height: (bounds.height / snapshot.bitmap.height) * snapshot.sceneBounds.height,
  };
}
