import { util, type Canvas, type TMat2D } from 'fabric';
import type { RasterTarget } from './adapters';
import type { PixelBounds, RasterSourceGeometry, SourcePoint } from './contracts';
import { createRasterPreview, type RasterPreviewOptions } from './preview';
import type { RasterPresentation } from './session';
import { rasterCropHandles } from './crop';

type Cursor = { point: SourcePoint; diameter: number };
function drawCursor(context: CanvasRenderingContext2D, matrix: TMat2D, cursor: Cursor) {
  context.save();
  try {
    context.transform(...matrix);
    context.setLineDash([]);
    const scale = Math.max(Math.hypot(matrix[0], matrix[1]), Math.hypot(matrix[2], matrix[3]));
    context.beginPath();
    context.arc(cursor.point.x, cursor.point.y, cursor.diameter / 2, 0, Math.PI * 2);
    context.strokeStyle = '#111';
    context.lineWidth = 3 / scale;
    context.stroke();
    context.strokeStyle = '#fff';
    context.lineWidth = 1 / scale;
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
function drawCrop(
  context: CanvasRenderingContext2D,
  matrix: TMat2D,
  bounds: PixelBounds,
  geometry: RasterSourceGeometry
) {
  const left = bounds.x,
    right = left + bounds.width,
    top = bounds.y,
    bottom = top + bounds.height;
  context.save();
  context.transform(...matrix);
  context.beginPath();
  context.rect(0, 0, geometry.width, geometry.height);
  context.rect(left, top, bounds.width, bounds.height);
  context.fillStyle = 'rgba(0,0,0,.35)';
  context.fill('evenodd');
  context.restore();
  context.beginPath();
  drawSourceEdge(context, matrix, { x: left, y: top }, { x: right, y: top });
  drawSourceEdge(context, matrix, { x: right, y: top }, { x: right, y: bottom });
  drawSourceEdge(context, matrix, { x: right, y: bottom }, { x: left, y: bottom });
  drawSourceEdge(context, matrix, { x: left, y: bottom }, { x: left, y: top });
  context.closePath();
  context.setLineDash([]);
  context.strokeStyle = '#111';
  context.lineWidth = 3;
  context.stroke();
  context.strokeStyle = '#fff';
  context.lineWidth = 1;
  context.stroke();
  context.setLineDash([]);
  context.strokeStyle = 'rgba(255,255,255,.65)';
  context.lineWidth = 1;
  context.beginPath();
  for (const fraction of [1 / 3, 2 / 3]) {
    const x = left + bounds.width * fraction,
      y = top + bounds.height * fraction;
    drawSourceEdge(context, matrix, { x, y: top }, { x, y: bottom });
    drawSourceEdge(context, matrix, { x: left, y }, { x: right, y });
  }
  context.stroke();
  context.fillStyle = '#fff';
  context.strokeStyle = '#2563eb';
  for (const [, point] of rasterCropHandles(bounds)) {
    const x = matrix[0] * point.x + matrix[2] * point.y + matrix[4];
    const y = matrix[1] * point.x + matrix[3] * point.y + matrix[5];
    context.fillRect(x - 3.5, y - 3.5, 7, 7);
    context.strokeRect(x - 3.5, y - 3.5, 7, 7);
  }
}
type SelectionOutline = { contours: SourcePoint[][] };

function selectionOutline(geometry: RasterSourceGeometry, mask: Uint8Array): SelectionOutline {
  const { width, height } = geometry;
  const stride = width + 1;
  const edges = new Map<number, number[]>();
  const edge = (start: number, end: number) => {
    const outgoing = edges.get(start);
    if (outgoing) outgoing.push(end);
    else edges.set(start, [end]);
  };
  for (let index = 0; index < mask.length; index++) {
    if (!mask[index]) continue;
    const x = index % width,
      y = Math.floor(index / width),
      corner = y * stride + x;
    if (y === 0 || !mask[index - width]) edge(corner, corner + 1);
    if (x === width - 1 || !mask[index + 1]) edge(corner + 1, corner + stride + 1);
    if (y === height - 1 || !mask[index + width]) edge(corner + stride + 1, corner + stride);
    if (x === 0 || !mask[index - 1]) edge(corner + stride, corner);
  }
  const contours: SourcePoint[][] = [];
  for (const [start, outgoing] of edges) {
    while (outgoing.length) {
      const contour = [start];
      let current = start;
      do {
        const next = edges.get(current)?.pop();
        if (next === undefined) break;
        contour.push(next);
        current = next;
      } while (current !== start);
      const points: SourcePoint[] = [];
      for (const corner of contour) {
        const point = { x: corner % stride, y: Math.floor(corner / stride) };
        const previous = points[points.length - 1],
          before = points[points.length - 2];
        if (
          previous &&
          before &&
          (previous.x - before.x) * (point.y - previous.y) ===
            (previous.y - before.y) * (point.x - previous.x)
        )
          points[points.length - 1] = point;
        else points.push(point);
      }
      contours.push(points);
    }
  }
  return { contours };
}
function strokeBoundary(context: CanvasRenderingContext2D) {
  context.setLineDash([]);
  context.strokeStyle = '#111';
  context.stroke();
  context.setLineDash([4, 4]);
  context.strokeStyle = '#fff';
  context.stroke();
}
function drawPoints(
  context: CanvasRenderingContext2D,
  matrix: TMat2D,
  points: readonly SourcePoint[],
  closed: boolean
) {
  const first = points[0];
  if (!first) return;
  context.moveTo(
    matrix[0] * first.x + matrix[2] * first.y + matrix[4],
    matrix[1] * first.x + matrix[3] * first.y + matrix[5]
  );
  for (let i = 1; i < points.length; i++) {
    const point = points[i]!;
    context.lineTo(
      matrix[0] * point.x + matrix[2] * point.y + matrix[4],
      matrix[1] * point.x + matrix[3] * point.y + matrix[5]
    );
  }
  if (closed) context.closePath();
}
function drawSelection(
  context: CanvasRenderingContext2D,
  matrix: TMat2D,
  outline: SelectionOutline
) {
  context.beginPath();
  for (const contour of outline.contours) {
    drawPoints(context, matrix, contour, true);
  }
  strokeBoundary(context);
}
function drawDraft(
  context: CanvasRenderingContext2D,
  matrix: TMat2D,
  draft: { points: readonly SourcePoint[]; method: 'rectangle' | 'lasso' }
) {
  context.beginPath();
  if (draft.method === 'lasso') drawPoints(context, matrix, draft.points, false);
  else {
    const first = draft.points[0],
      last = draft.points[draft.points.length - 1];
    if (first && last)
      drawPoints(
        context,
        matrix,
        [first, { x: last.x, y: first.y }, last, { x: first.x, y: last.y }],
        true
      );
  }
  strokeBoundary(context);
}
/** Draw disposable interaction chrome; the preview owner controls all native source projection. */
export function createRasterOverlay(
  canvas: Canvas,
  options: RasterPreviewOptions = {}
): RasterPresentation & { dispose(): void } {
  const preview = createRasterPreview(canvas, options);
  let target: RasterTarget | null = null,
    outline: SelectionOutline | null = null,
    draft: { points: readonly SourcePoint[]; method: 'rectangle' | 'lasso' } | null = null,
    crop: PixelBounds | null = null,
    cursor: Cursor | null = null;
  function renderOverlay() {
    if (!target) return;
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
      if (crop) drawCrop(context, matrix, crop, target.geometry);
      else {
        if (outline) drawSelection(context, matrix, outline);
        if (draft) drawDraft(context, matrix, draft);
      }
    } finally {
      context.restore();
    }
  }
  const removeAfter = canvas.on('after:render', ({ ctx }) => {
    if (ctx === canvas.getContext()) renderOverlay();
  });
  function clear() {
    preview.clear();
    target = null;
    outline = null;
    draft = null;
    crop = null;
    cursor = null;
    canvas.clearContext(canvas.contextTop);
    canvas.requestRenderAll();
  }
  return {
    pixels: preview.pixels,
    selection(next, selection) {
      target = next;
      outline = selection ? selectionOutline(next.geometry, selection) : null;
      draft = null;
      crop = null;
      canvas.requestRenderAll();
    },
    draftSelection(next, points, method) {
      target = next;
      draft = { points, method };
      canvas.requestRenderAll();
    },
    crop(next, bounds) {
      target = next;
      crop = bounds ?? { x: 0, y: 0, width: next.geometry.width, height: next.geometry.height };
      outline = null;
      draft = null;
      preview.expandSource(next);
      canvas.requestRenderAll();
    },
    hideCursor() {
      if (!cursor) return;
      cursor = null;
      renderOverlay();
    },
    cursor(next, point, diameter) {
      target = next;
      cursor = { point, diameter };
      renderOverlay();
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
