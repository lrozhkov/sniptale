import type { Canvas, FabricObject } from 'fabric';
import {
  parseDrawingSimplifySnapshot,
  getDrawingObjectSelectionBounds,
  type DrawingBounds,
  type DrawingSimplifyObject,
  type DrawingSimplifySource,
} from '../../features/drawing/public';
import { getEditorEditingDocumentSize } from '../document/canvas-surface/editing-surface';
import {
  renderBackdropCanvas,
  type MutableBlurCanvas,
} from '../objects/annotation/blur/backdrop/canvas';
import { readEditorDrawingObject } from './object/metadata';

const MAX_SOURCE_PIXELS = 16_777_216;
const CONTEXT_PIXELS = 512;
const SOURCE_GRID = 32;

function requiredBounds(
  drawing: DrawingSimplifyObject,
  size: { width: number; height: number } | null
): DrawingBounds {
  const rotated = getDrawingObjectSelectionBounds(drawing);
  // Manual rotated text samples its local rectangle before projecting the source.
  const left = Math.max(0, Math.floor(Math.min(drawing.bounds.x, rotated.x)));
  const top = Math.max(0, Math.floor(Math.min(drawing.bounds.y, rotated.y)));
  const right = Math.min(
    size ? Math.ceil(size.width) : Infinity,
    Math.ceil(Math.max(drawing.bounds.x + drawing.bounds.width, rotated.x + rotated.width))
  );
  const bottom = Math.min(
    size ? Math.ceil(size.height) : Infinity,
    Math.ceil(Math.max(drawing.bounds.y + drawing.bounds.height, rotated.y + rotated.height))
  );
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** A retained tile is reusable only while it covers the current drawing geometry. */
export function sourceCoversDrawing(
  canvas: Canvas,
  source: DrawingSimplifySource,
  drawing: DrawingSimplifyObject
): boolean {
  const needed = requiredBounds(drawing, getEditorEditingDocumentSize(canvas));
  return (
    needed.width > 0 &&
    needed.height > 0 &&
    source.bounds.x <= needed.x &&
    source.bounds.y <= needed.y &&
    source.bounds.x + source.bounds.width >= needed.x + needed.width &&
    source.bounds.y + source.bounds.height >= needed.y + needed.height
  );
}

function captureBounds(
  size: { width: number; height: number },
  drawing: DrawingSimplifyObject
): DrawingBounds {
  if (Math.ceil(size.width) * Math.ceil(size.height) <= MAX_SOURCE_PIXELS)
    return { x: 0, y: 0, width: size.width, height: size.height };
  const needed = requiredBounds(drawing, size);
  if (needed.width <= 0 || needed.height <= 0 || needed.width * needed.height > MAX_SOURCE_PIXELS)
    throw new Error('Simplify region exceeds the raster budget.');
  // Keep native pixels and the analysis grid phase. Context can include complete
  // connected graphics (up to512px); trim context, never selected pixels, to fit.
  for (let padding = CONTEXT_PIXELS; padding >= 1; padding = Math.floor(padding / 2)) {
    const x = Math.max(0, Math.floor((needed.x - padding) / SOURCE_GRID) * SOURCE_GRID);
    const y = Math.max(0, Math.floor((needed.y - padding) / SOURCE_GRID) * SOURCE_GRID);
    const right = Math.min(
      Math.ceil(size.width),
      Math.ceil((needed.x + needed.width + padding) / SOURCE_GRID) * SOURCE_GRID
    );
    const bottom = Math.min(
      Math.ceil(size.height),
      Math.ceil((needed.y + needed.height + padding) / SOURCE_GRID) * SOURCE_GRID
    );
    if ((right - x) * (bottom - y) <= MAX_SOURCE_PIXELS)
      return { x, y, width: right - x, height: bottom - y };
  }
  return needed;
}

export function captureSource(canvas: Canvas, object: FabricObject): DrawingSimplifySource {
  const size = getEditorEditingDocumentSize(canvas);
  const drawing = readEditorDrawingObject(object);
  if (!size || drawing?.kind !== 'simplify') throw new Error('Simplify source is unavailable.');
  const bounds = captureBounds(size, drawing);
  const width = Math.ceil(bounds.width);
  const height = Math.ceil(bounds.height);
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const context = output.getContext('2d');
  const objectIndex = canvas.getObjects().indexOf(object);
  if (!context || objectIndex < 0) throw new Error('Simplify source is unavailable.');
  renderBackdropCanvas({
    backdropCanvas: output,
    bounds: {
      width,
      height,
      paddedWidth: width,
      paddedHeight: height,
      left: bounds.x,
      top: bounds.y,
    },
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
  return { ...snapshot, bounds };
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
