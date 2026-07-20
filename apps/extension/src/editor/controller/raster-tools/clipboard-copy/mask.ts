import { getRasterMaskBounds } from '../../raster/selection/bounds';
import { createEmptyRasterMask } from '../../raster/selection/mask';
import { createRasterCanvas, getRasterImageData } from '../../raster/bitmap';
import type { EditorRasterSelectionMask } from '../../raster/types';
import type { RasterClipboardPayload } from '../clipboard-types';
import { mapMaskBoundsToScene } from './scene-bounds';

function readMaskImageData(
  maskCanvas: HTMLCanvasElement,
  bounds: ReturnType<typeof getRasterMaskBounds>
) {
  if (!bounds) {
    return null;
  }

  return (
    maskCanvas
      .getContext('2d')
      ?.getImageData(bounds.left, bounds.top, bounds.width, bounds.height) ?? null
  );
}

function applyMaskAlpha(bitmap: HTMLCanvasElement, maskImage: ImageData): void {
  const imageData = getRasterImageData(bitmap);
  for (let index = 0; index < imageData.data.length; index += 4) {
    const alpha = maskImage.data[index + 3] ?? 0;
    imageData.data[index + 3] = Math.round(((imageData.data[index + 3] ?? 0) * alpha) / 255);
  }

  bitmap.getContext('2d')?.putImageData(imageData, 0, 0);
}

export function createMaskedClipboardBitmap(
  selection: EditorRasterSelectionMask,
  snapshot: { bitmap: HTMLCanvasElement; sceneBounds: RasterClipboardPayload['sceneBounds'] }
): { bitmap: HTMLCanvasElement; sceneBounds: RasterClipboardPayload['sceneBounds'] } | null {
  const bounds = getRasterMaskBounds(selection.maskCanvas);
  const maskImage = readMaskImageData(selection.maskCanvas, bounds);
  if (!bounds || !maskImage) {
    return null;
  }

  const bitmap = createRasterCanvas(bounds.width, bounds.height);
  bitmap
    .getContext('2d')
    ?.drawImage(
      snapshot.bitmap,
      bounds.left,
      bounds.top,
      bounds.width,
      bounds.height,
      0,
      0,
      bounds.width,
      bounds.height
    );
  applyMaskAlpha(bitmap, maskImage);

  return {
    bitmap,
    sceneBounds: mapMaskBoundsToScene(snapshot, bounds),
  };
}

export function copySelectionMask(selection: EditorRasterSelectionMask): HTMLCanvasElement {
  const mask = createEmptyRasterMask(selection.maskCanvas.width, selection.maskCanvas.height);
  mask.getContext('2d')?.drawImage(selection.maskCanvas, 0, 0);
  return mask;
}
