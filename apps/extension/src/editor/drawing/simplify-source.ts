import type { Canvas, FabricObject } from 'fabric';
import {
  parseDrawingSimplifySnapshot,
  type DrawingSimplifyObject,
  type DrawingSimplifySource,
} from '../../features/drawing/public';
import { getEditorEditingDocumentSize } from '../document/canvas-surface/editing-surface';
import {
  renderBackdropCanvas,
  type MutableBlurCanvas,
} from '../objects/annotation/blur/backdrop/canvas';

export function captureSource(canvas: Canvas, object: FabricObject): DrawingSimplifySource {
  const size = getEditorEditingDocumentSize(canvas);
  if (!size || Math.ceil(size.width) * Math.ceil(size.height) > 16_777_216)
    throw new Error('Simplify source exceeds the raster budget.');
  const width = Math.ceil(size.width);
  const height = Math.ceil(size.height);
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const context = output.getContext('2d');
  const objectIndex = canvas.getObjects().indexOf(object);
  if (!context || objectIndex < 0) throw new Error('Simplify source is unavailable.');
  renderBackdropCanvas({
    backdropCanvas: output,
    bounds: { width, height, paddedWidth: width, paddedHeight: height, left: 0, top: 0 },
    canvas: canvas as MutableBlurCanvas,
    context,
    objectIndex,
  });
  const snapshot = parseDrawingSimplifySnapshot({
    dataUrl: output.toDataURL('image/png'),
    width,
    height,
  });
  if (!snapshot) throw new Error('Simplify source exceeds the raster budget.');
  return { ...snapshot, bounds: { x: 0, y: 0, width: size.width, height: size.height } };
}

export function createManualSource(drawing: DrawingSimplifyObject): DrawingSimplifySource {
  const width = Math.max(1, Math.ceil(drawing.bounds.width));
  const height = Math.max(1, Math.ceil(drawing.bounds.height));
  if (width * height > 16_777_216) throw new Error('Simplify region exceeds the raster budget.');
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  return {
    dataUrl: output.toDataURL('image/png'),
    width: output.width,
    height: output.height,
    bounds: drawing.bounds,
  };
}
