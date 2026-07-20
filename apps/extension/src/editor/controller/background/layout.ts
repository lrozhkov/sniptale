import type { Canvas, FabricImage, FabricObject } from 'fabric';

import type { EditorFrameSettings } from '../../../features/editor/document/types';
import {
  createBackgroundGradient,
  getBackgroundImageLayout,
  type BackgroundCanvasSize,
} from './geometry';
import { findBackgroundLayer } from './identity';

function syncManagedBackgroundImageLayout(
  background: FabricObject,
  canvasSize: BackgroundCanvasSize,
  frame: EditorFrameSettings
): void {
  if (frame.backgroundImageFit === 'tile') {
    background.set({
      height: canvasSize.height,
      left: 0,
      scaleX: 1,
      scaleY: 1,
      top: 0,
      width: canvasSize.width,
    });
    return;
  }

  background.set({
    ...getBackgroundImageLayout(frame.backgroundImageFit, canvasSize, background as FabricImage),
  });
}

export function syncManagedBackgroundLayerLayout(options: {
  canvas: Canvas | null;
  canvasSize: BackgroundCanvasSize;
  frame: EditorFrameSettings;
}): void {
  const { canvas, canvasSize, frame } = options;
  if (!canvas) {
    return;
  }

  const background = findBackgroundLayer(canvas);
  if (!background || background.sniptaleBackgroundMode !== frame.backgroundMode) {
    return;
  }

  if (
    frame.backgroundMode === 'image' &&
    (background.sniptaleBackgroundFit !== frame.backgroundImageFit ||
      background.sniptaleBackgroundImageData !== frame.backgroundImageData)
  ) {
    return;
  }

  if (frame.backgroundMode === 'image') {
    syncManagedBackgroundImageLayout(background, canvasSize, frame);
  } else {
    background.set({
      fill:
        frame.backgroundMode === 'gradient'
          ? createBackgroundGradient(canvasSize, frame)
          : frame.backgroundColor,
      height: canvasSize.height,
      left: 0,
      scaleX: 1,
      scaleY: 1,
      top: 0,
      width: canvasSize.width,
    });
  }

  background.setCoords();
}
