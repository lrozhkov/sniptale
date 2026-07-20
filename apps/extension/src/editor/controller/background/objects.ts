import { FabricImage, Pattern, Rect, type FabricObject } from 'fabric';

import type { EditorFrameSettings } from '../../../features/editor/document/types';
import { isTransparentColor } from '../../document/model';
import {
  createBackgroundGradient,
  getBackgroundImageLayout,
  loadBackgroundImageElement,
  type BackgroundCanvasSize,
} from './geometry';

function createSolidBackground(
  size: BackgroundCanvasSize,
  frame: EditorFrameSettings
): FabricObject | null {
  if (frame.backgroundMode === 'color' && isTransparentColor(frame.backgroundColor)) {
    return null;
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
  frame: EditorFrameSettings
): Promise<FabricObject> {
  const source = await loadBackgroundImageElement(frame.backgroundImageData ?? '');
  return new Rect({
    fill: new Pattern({ source, repeat: 'repeat' }),
    height: size.height,
    left: 0,
    originX: 'left',
    originY: 'top',
    strokeWidth: 0,
    top: 0,
    width: size.width,
  });
}

async function createImageBackground(size: BackgroundCanvasSize, frame: EditorFrameSettings) {
  if (!frame.backgroundImageData) {
    return null;
  }

  if (frame.backgroundImageFit === 'tile') {
    return createTiledImageBackground(size, frame);
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
  frame: EditorFrameSettings
) {
  if (size.width <= 0 || size.height <= 0) {
    return null;
  }

  return frame.backgroundMode === 'image'
    ? createImageBackground(size, frame)
    : createSolidBackground(size, frame);
}
