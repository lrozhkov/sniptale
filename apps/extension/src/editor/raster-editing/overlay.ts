import { util, type Canvas, type TMat2D } from 'fabric';
import type { RasterTarget } from './adapters';
import type { PixelBounds, RasterSourceGeometry, SelectionMask, SourcePoint } from './contracts';
import { createRasterPreview, type RasterPreviewOptions } from './preview';
import type { RasterPresentation } from './session';

type Cursor = { point: SourcePoint; diameter: number };
function drawCursor(context: CanvasRenderingContext2D, matrix: TMat2D, cursor: Cursor) {
  context.save();
  try {
    context.transform(...matrix);
    context.setLineDash([]);
    context.lineWidth =
      1 / Math.max(Math.hypot(matrix[0], matrix[1]), Math.hypot(matrix[2], matrix[3]));
    context.beginPath();
    context.arc(cursor.point.x, cursor.point.y, cursor.diameter / 2, 0, Math.PI * 2);
    context.stroke();
  } finally {
    context.restore();
  }
}
function drawSourceEdge(
  context: CanvasRenderingContext2D,
  matrix: TMat2D,
  start: SourcePoint,
  end: SourcePoint
) {
  context.moveTo(
    matrix[0] * start.x + matrix[2] * start.y + matrix[4],
    matrix[1] * start.x + matrix[3] * start.y + matrix[5]
  );
  context.lineTo(
    matrix[0] * end.x + matrix[2] * end.y + matrix[4],
    matrix[1] * end.x + matrix[3] * end.y + matrix[5]
  );
}
function drawCrop(context: CanvasRenderingContext2D, matrix: TMat2D, bounds: PixelBounds) {
  const left = bounds.x,
    right = left + bounds.width,
    top = bounds.y,
    bottom = top + bounds.height;
  context.beginPath();
  drawSourceEdge(context, matrix, { x: left, y: top }, { x: right, y: top });
  drawSourceEdge(context, matrix, { x: right, y: top }, { x: right, y: bottom });
  drawSourceEdge(context, matrix, { x: right, y: bottom }, { x: left, y: bottom });
  drawSourceEdge(context, matrix, { x: left, y: bottom }, { x: left, y: top });
  context.closePath();
  context.stroke();
}
function drawSelection(
  context: CanvasRenderingContext2D,
  matrix: TMat2D,
  geometry: RasterSourceGeometry,
  mask: Uint8Array
) {
  const { width, height } = geometry;
  context.beginPath();
  // Interior pixels add no edges to the selection boundary.
  for (let index = 0; index < mask.length; index++) {
    if (!mask[index]) continue;
    const x = index % width,
      y = Math.floor(index / width);
    if (x === 0 || !mask[index - 1]) drawSourceEdge(context, matrix, { x, y }, { x, y: y + 1 });
    if (x === width - 1 || !mask[index + 1])
      drawSourceEdge(context, matrix, { x: x + 1, y }, { x: x + 1, y: y + 1 });
    if (y === 0 || !mask[index - width]) drawSourceEdge(context, matrix, { x, y }, { x: x + 1, y });
    if (y === height - 1 || !mask[index + width])
      drawSourceEdge(context, matrix, { x, y: y + 1 }, { x: x + 1, y: y + 1 });
  }
  context.stroke();
}
/** Draw disposable interaction chrome; the preview owner controls all native source projection. */
export function createRasterOverlay(
  canvas: Canvas,
  options: RasterPreviewOptions = {}
): RasterPresentation & { dispose(): void } {
  const preview = createRasterPreview(canvas, options);
  let target: RasterTarget | null = null,
    mask: SelectionMask = null,
    crop: PixelBounds | null = null,
    cursor: Cursor | null = null;
  const removeAfter = canvas.on('after:render', ({ ctx }) => {
    if (ctx !== canvas.getContext() || !target) return;
    const context = canvas.contextTop,
      matrix = util.multiplyTransformMatrices(canvas.viewportTransform, [
        ...target.geometry.sourceToScene,
      ]);
    canvas.clearContext(context);
    context.save();
    try {
      context.strokeStyle = '#fff';
      context.lineWidth = 1;
      context.setLineDash([4, 4]);
      if (cursor) drawCursor(context, matrix, cursor);
      if (crop) drawCrop(context, matrix, crop);
      else if (mask) drawSelection(context, matrix, target.geometry, mask);
    } finally {
      context.restore();
    }
  });
  function clear() {
    preview.clear();
    target = null;
    mask = null;
    crop = null;
    cursor = null;
    canvas.clearContext(canvas.contextTop);
    canvas.requestRenderAll();
  }
  return {
    pixels: preview.pixels,
    selection(next, selection) {
      target = next;
      mask = selection;
      crop = null;
      canvas.requestRenderAll();
    },
    crop(next, bounds) {
      target = next;
      crop = bounds ?? { x: 0, y: 0, width: next.geometry.width, height: next.geometry.height };
      mask = null;
      preview.expandSource(next);
      canvas.requestRenderAll();
    },
    cursor(next, point, diameter) {
      target = next;
      cursor = { point, diameter };
      canvas.requestRenderAll();
    },
    prepared: preview.install,
    clear,
    dispose() {
      clear();
      preview.dispose();
      removeAfter();
    },
  };
}
