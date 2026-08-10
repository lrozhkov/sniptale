import {
  buildDrawingStrokeOutline,
  buildDrawingArrowOutline,
  createDrawingBounds,
  DRAWING_TEXT_HORIZONTAL_PADDING,
  DRAWING_TEXT_LINE_HEIGHT_FACTOR,
  DRAWING_TEXT_VERTICAL_PADDING,
  getDrawingBoundsCenter,
  getDrawingEllipsePoints,
  getDrawingObjectBounds,
  getDrawingObjectRotation,
  getDrawingObjectSkewX,
  getDrawingShapePoints,
  getDrawingSelectionBounds,
  resolveDrawingTextFontFamily,
  type DrawingObject,
  type DrawingPoint,
} from '../../features/drawing/public';
import { drawRoughArrow } from './rough-arrow';

export interface DrawingViewportProjection {
  readonly x: number;
  readonly y: number;
}

const viewportPoint = (point: DrawingPoint, projection: DrawingViewportProjection) => ({
  x: point.x - projection.x,
  y: point.y - projection.y,
});

function applyDrawingObjectTransform(
  context: CanvasRenderingContext2D,
  object: DrawingObject,
  projection: DrawingViewportProjection
): void {
  const rotation = getDrawingObjectRotation(object);
  if (rotation === 0) return;
  const center = viewportPoint(getDrawingBoundsCenter(getDrawingObjectBounds(object)), projection);
  context.translate(center.x, center.y);
  context.rotate((rotation * Math.PI) / 180);
  context.translate(-center.x, -center.y);
}

function fillPolygon(
  context: CanvasRenderingContext2D,
  points: readonly DrawingPoint[],
  projection: DrawingViewportProjection
) {
  const first = points[0];
  if (!first) return;
  const start = viewportPoint(first, projection);
  context.beginPath();
  context.moveTo(start.x, start.y);
  points.slice(1).forEach((point) => {
    const next = viewportPoint(point, projection);
    context.lineTo(next.x, next.y);
  });
  context.closePath();
  context.fill();
}

function drawText(
  context: CanvasRenderingContext2D,
  object: Extract<DrawingObject, { kind: 'text' }>,
  projection: DrawingViewportProjection
) {
  const bounds = getDrawingObjectBounds(object);
  const x = bounds.x - projection.x;
  const y = bounds.y - projection.y;
  context.font = `${object.fontSize}px ${resolveDrawingTextFontFamily(object.fontFamily)}`;
  context.textBaseline = 'alphabetic';
  const lineHeight = object.fontSize * DRAWING_TEXT_LINE_HEIGHT_FACTOR;
  const maxWidth = Math.max(1, bounds.width - DRAWING_TEXT_HORIZONTAL_PADDING);
  const lines: string[] = [];
  object.text.split('\n').forEach((paragraph) => {
    const words = paragraph.split(/\s+/);
    let line = '';
    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else line = candidate;
    });
    lines.push(line);
  });
  if (object.backgroundColor) {
    context.fillStyle = object.backgroundColor;
    lines.forEach((line, index) => {
      context.beginPath();
      context.roundRect(
        x,
        y + DRAWING_TEXT_VERTICAL_PADDING + index * lineHeight,
        Math.min(bounds.width, Math.max(12, context.measureText(line).width + 12)),
        lineHeight,
        3
      );
      context.fill();
    });
  }
  context.fillStyle = object.color;
  const metrics = context.measureText('Mg');
  const fontBoxAscent = metrics.fontBoundingBoxAscent ?? object.fontSize * 0.8;
  const fontBoxDescent = metrics.fontBoundingBoxDescent ?? object.fontSize * 0.2;
  const leading = Math.max(0, lineHeight - fontBoxAscent - fontBoxDescent) / 2;
  const firstBaseline = y + DRAWING_TEXT_VERTICAL_PADDING + leading + fontBoxAscent;
  lines.forEach((line, index) =>
    context.fillText(
      line,
      x + DRAWING_TEXT_HORIZONTAL_PADDING / 2,
      firstBaseline + index * lineHeight
    )
  );
}

function tracePolygon(
  context: CanvasRenderingContext2D,
  object: Extract<DrawingObject, { kind: 'rectangle' | 'triangle' | 'parallelogram' }>,
  projection: DrawingViewportProjection
) {
  const points = getDrawingShapePoints(object);
  const first = points[0];
  if (!first) return;
  const start = viewportPoint(first, projection);
  context.beginPath();
  context.moveTo(start.x, start.y);
  points.slice(1).forEach((point) => {
    const next = viewportPoint(point, projection);
    context.lineTo(next.x, next.y);
  });
  context.closePath();
}

function drawFreehand(
  context: CanvasRenderingContext2D,
  object: Extract<DrawingObject, { kind: 'pencil' | 'marker' }>,
  projection: DrawingViewportProjection,
  preview: boolean
) {
  const outline = buildDrawingStrokeOutline(object.samples, object.width, {
    dynamicWidth: object.kind === 'pencil',
    smoothingLevel: preview ? 4 : 10,
    ...(preview ? { preview: true } : {}),
  });
  context.fillStyle = object.color;
  context.globalAlpha = object.kind === 'marker' ? object.opacity : 1;
  fillPolygon(context, outline, projection);
}

export function renderDrawingObject(
  context: CanvasRenderingContext2D,
  object: DrawingObject,
  projection: DrawingViewportProjection,
  options: { readonly preview?: boolean } = {}
): void {
  context.save();
  applyDrawingObjectTransform(context, object, projection);
  if (object.kind === 'pencil' || object.kind === 'marker') {
    drawFreehand(context, object, projection, options.preview === true);
  } else if (
    object.kind === 'rectangle' ||
    object.kind === 'triangle' ||
    object.kind === 'parallelogram'
  ) {
    context.strokeStyle = object.color;
    context.lineWidth = object.width;
    context.lineJoin = 'round';
    tracePolygon(context, object, projection);
    if (object.fillColor) {
      context.fillStyle = object.fillColor;
      context.fill();
    }
    context.stroke();
  } else if (object.kind === 'ellipse') {
    context.strokeStyle = object.color;
    context.lineWidth = object.width;
    context.beginPath();
    if (getDrawingObjectSkewX(object) === 0) {
      const bounds = getDrawingObjectBounds(object);
      context.ellipse(
        bounds.x + bounds.width / 2 - projection.x,
        bounds.y + bounds.height / 2 - projection.y,
        bounds.width / 2,
        bounds.height / 2,
        0,
        0,
        Math.PI * 2
      );
    } else {
      const points = getDrawingEllipsePoints(object);
      const first = points[0];
      if (first) {
        const start = viewportPoint(first, projection);
        context.moveTo(start.x, start.y);
        points.slice(1).forEach((point) => {
          const next = viewportPoint(point, projection);
          context.lineTo(next.x, next.y);
        });
        context.closePath();
      }
    }
    if (object.fillColor) {
      context.fillStyle = object.fillColor;
      context.fill();
    }
    context.stroke();
  } else if (object.kind === 'arrow') {
    if (object.design === 'freehand') drawRoughArrow(context, object, projection);
    else {
      context.fillStyle = object.color;
      fillPolygon(context, buildDrawingArrowOutline(object), projection);
    }
  } else if (object.kind === 'text') {
    drawText(context, object, projection);
  }
  context.restore();
}

export function renderDrawingSelection(
  context: CanvasRenderingContext2D,
  object: DrawingObject,
  projection: DrawingViewportProjection
): void {
  const bounds = getDrawingObjectBounds(object);
  const x = bounds.x - projection.x;
  const y = bounds.y - projection.y;
  context.save();
  applyDrawingObjectTransform(context, object, projection);
  context.strokeStyle = '#2563eb';
  context.lineWidth = 1;
  if (object.kind !== 'arrow') {
    context.setLineDash([4, 3]);
    context.strokeRect(x, y, bounds.width, bounds.height);
    context.setLineDash([]);
  }
  const handles =
    object.kind === 'arrow'
      ? [viewportPoint(object.start, projection), viewportPoint(object.end, projection)]
      : object.kind === 'text'
        ? [
            { x, y: y + bounds.height / 2 },
            { x: x + bounds.width, y: y + bounds.height / 2 },
          ]
        : [
            { x, y },
            { x: x + bounds.width / 2, y },
            { x: x + bounds.width, y },
            { x: x + bounds.width, y: y + bounds.height / 2 },
            { x: x + bounds.width, y: y + bounds.height },
            { x: x + bounds.width / 2, y: y + bounds.height },
            { x, y: y + bounds.height },
            { x, y: y + bounds.height / 2 },
          ];
  handles.forEach((handle) => {
    context.fillStyle = '#ffffff';
    context.strokeStyle = '#2563eb';
    context.beginPath();
    context.arc(handle.x, handle.y, 4, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  });
  if (object.kind !== 'arrow') {
    const center = { x: x + bounds.width / 2, y: y + bounds.height / 2 };
    const corner = { x: x + bounds.width, y };
    const distance = Math.max(1, Math.hypot(corner.x - center.x, corner.y - center.y));
    renderDrawingRotationControl(context, {
      x: corner.x + ((corner.x - center.x) / distance) * 18,
      y: corner.y + ((corner.y - center.y) / distance) * 18,
    });
  }
  context.restore();
}

export function renderDrawingMultiSelection(
  context: CanvasRenderingContext2D,
  objects: readonly DrawingObject[],
  projection: DrawingViewportProjection
): void {
  const bounds = getDrawingSelectionBounds(objects);
  if (!bounds) return;
  context.save();
  context.strokeStyle = '#2563eb';
  context.lineWidth = 1;
  context.setLineDash([4, 3]);
  context.strokeRect(bounds.x - projection.x, bounds.y - projection.y, bounds.width, bounds.height);
  context.restore();
}

export function renderDrawingMarquee(
  context: CanvasRenderingContext2D,
  start: DrawingPoint,
  current: DrawingPoint,
  projection: DrawingViewportProjection
): void {
  const bounds = createDrawingBounds(start, current);
  context.save();
  context.fillStyle = 'rgba(37, 99, 235, 0.08)';
  context.strokeStyle = '#2563eb';
  context.lineWidth = 1;
  context.setLineDash([4, 3]);
  context.fillRect(bounds.x - projection.x, bounds.y - projection.y, bounds.width, bounds.height);
  context.strokeRect(bounds.x - projection.x, bounds.y - projection.y, bounds.width, bounds.height);
  context.restore();
}

function renderDrawingRotationControl(
  context: CanvasRenderingContext2D,
  point: DrawingPoint
): void {
  context.save();
  context.translate(point.x, point.y);
  context.scale(0.65, 0.65);
  context.translate(-12, -12);
  context.lineWidth = 2;
  context.strokeStyle = '#2563eb';
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.arc(12, 12, 9, Math.PI, Math.PI * 1.75);
  context.lineTo(21, 8);
  context.moveTo(21, 3);
  context.lineTo(21, 8);
  context.lineTo(16, 8);
  context.stroke();
  context.beginPath();
  context.arc(12, 12, 9, 0, Math.PI * 0.75);
  context.lineTo(3, 16);
  context.moveTo(8, 16);
  context.lineTo(3, 16);
  context.lineTo(3, 21);
  context.stroke();
  context.restore();
}
