import { Gradient, type FabricImage } from 'fabric';

import type { EditorFrameSettings } from '../../../features/editor/document/types';
import { createEditorGradientColorStopColor } from '../../../features/editor/document/gradient';
import { normalizeEditorFrameGradientColorStops } from '../../../features/editor/document/frame-gradient';

export type BackgroundCanvasSize = { width: number; height: number };

function normalizeGradientAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

function snapBackgroundOffsetToPixel(offset: number): number {
  if (!Number.isFinite(offset)) {
    return 0;
  }

  return offset < 0 ? Math.floor(offset) : Math.round(offset);
}

export function createBackgroundGradient(
  size: BackgroundCanvasSize,
  frame: EditorFrameSettings
): Gradient<'linear'> {
  const angleRad = ((normalizeGradientAngle(frame.backgroundGradientAngle) - 90) * Math.PI) / 180;
  const centerX = size.width / 2;
  const centerY = size.height / 2;
  const radius =
    (Math.abs(Math.cos(angleRad)) * size.width) / 2 +
    (Math.abs(Math.sin(angleRad)) * size.height) / 2;
  const deltaX = Math.cos(angleRad) * radius;
  const deltaY = Math.sin(angleRad) * radius;

  return new Gradient({
    type: 'linear',
    coords: {
      x1: centerX - deltaX,
      y1: centerY - deltaY,
      x2: centerX + deltaX,
      y2: centerY + deltaY,
    },
    colorStops: normalizeEditorFrameGradientColorStops(frame).map((stop) => ({
      offset: stop.offset,
      color: createEditorGradientColorStopColor(stop),
    })),
  });
}

export function getBackgroundImageLayout(
  fit: EditorFrameSettings['backgroundImageFit'],
  size: BackgroundCanvasSize,
  image: FabricImage
) {
  const width = Math.max(1, image.width ?? 1);
  const height = Math.max(1, image.height ?? 1);
  const scaleX = size.width / width;
  const scaleY = size.height / height;
  const scale =
    fit === 'contain'
      ? Math.min(scaleX, scaleY)
      : fit === 'fit-width'
        ? scaleX
        : fit === 'fit-height'
          ? scaleY
          : Math.max(scaleX, scaleY);
  const resolvedScaleX = fit === 'stretch' ? scaleX : scale;
  const resolvedScaleY = fit === 'stretch' ? scaleY : scale;
  const renderedWidth = width * resolvedScaleX;
  const renderedHeight = height * resolvedScaleY;

  return {
    left: snapBackgroundOffsetToPixel((size.width - renderedWidth) / 2),
    scaleX: Number.isFinite(resolvedScaleX) && resolvedScaleX > 0 ? resolvedScaleX : 1,
    scaleY: Number.isFinite(resolvedScaleY) && resolvedScaleY > 0 ? resolvedScaleY : 1,
    top: snapBackgroundOffsetToPixel((size.height - renderedHeight) / 2),
  };
}

export function loadBackgroundImageElement(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load editor background image'));
    image.src = source;
  });
}
