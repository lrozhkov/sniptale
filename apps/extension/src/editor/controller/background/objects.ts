import { FabricImage, Pattern, Rect, type FabricObject, type TMat2D } from 'fabric';

import type { EditorFrameSettings } from '../../../features/editor/document/types';
import { isTransparentColor } from '../../document/model';
import {
  createBackgroundGradient,
  getBackgroundImageLayout,
  loadBackgroundImageElement,
  type BackgroundCanvasSize,
} from './geometry';
import {
  createAdvancedBackgroundImage,
  rasterizeBlurredBackground,
  resolveBackgroundRasterSize,
} from './raster';

function createSolidBackground(
  size: BackgroundCanvasSize,
  frame: EditorFrameSettings,
  preview = false
): FabricObject | null {
  if (frame.backgroundMode === 'color' && isTransparentColor(frame.backgroundColor)) {
    return null;
  }

  if (frame.backgroundMode === 'gradient') {
    const raster = createAdvancedBackgroundImage(size, frame, preview);
    if (raster) return raster;
  }

  return new Rect({
    fill:
      frame.backgroundMode === 'gradient'
        ? createBackgroundGradient(size, frame)
        : frame.backgroundColor,
    height: size.height,
    left: 0,
    originX: 'left',
    originY: 'top',
    strokeWidth: 0,
    top: 0,
    width: size.width,
  });
}

async function createTiledImageBackground(
  size: BackgroundCanvasSize,
  frame: EditorFrameSettings,
  patternTransform?: TMat2D
): Promise<FabricObject> {
  const source = await loadBackgroundImageElement(frame.backgroundImageData ?? '');
  return new Rect({
    fill: new Pattern({
      source,
      repeat: 'repeat',
      ...(patternTransform ? { patternTransform } : {}),
    }),
    height: size.height,
    left: 0,
    originX: 'left',
    originY: 'top',
    strokeWidth: 0,
    top: 0,
    width: size.width,
  });
}

async function createImageBackground(
  size: BackgroundCanvasSize,
  frame: EditorFrameSettings,
  patternTransform?: TMat2D
) {
  if (!frame.backgroundImageData) {
    return null;
  }

  if (frame.backgroundImageFit === 'tile') {
    return createTiledImageBackground(size, frame, patternTransform);
  }

  const image = await FabricImage.fromURL(frame.backgroundImageData);
  image.set({
    ...getBackgroundImageLayout(frame.backgroundImageFit, size, image),
    originX: 'left',
    originY: 'top',
    strokeWidth: 0,
  });
  return image;
}

export async function createBackgroundLayer(
  size: BackgroundCanvasSize,
  frame: EditorFrameSettings,
  preview = false
) {
  if (size.width <= 0 || size.height <= 0) {
    return null;
  }

  if (frame.backgroundBlurAmount === 0) {
    return frame.backgroundMode === 'image'
      ? createImageBackground(size, frame)
      : createSolidBackground(size, frame, preview);
  }

  const rasterSize = resolveBackgroundRasterSize(size, preview);
  const finalRasterSize =
    preview && frame.backgroundImageFit === 'tile' ? resolveBackgroundRasterSize(size) : rasterSize;
  const tileTransform: TMat2D | undefined =
    preview && frame.backgroundImageFit === 'tile'
      ? [
          rasterSize.width / finalRasterSize.width,
          0,
          0,
          rasterSize.height / finalRasterSize.height,
          0,
          0,
        ]
      : undefined;
  const source =
    frame.backgroundMode === 'image'
      ? await createImageBackground(rasterSize, frame, tileTransform)
      : createSolidBackground(rasterSize, frame, preview);
  return source
    ? rasterizeBlurredBackground({
        amount: frame.backgroundBlurAmount,
        object: source,
        rasterSize,
        targetSize: size,
      })
    : null;
}
