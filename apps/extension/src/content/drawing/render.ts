import {
  buildDrawingStrokeOutline,
  buildDrawingArrowOutline,
  getDrawingObjectBounds,
  getDrawingShapePoints,
  type DrawingObject,
  type DrawingPoint,
} from '../../features/drawing/public';

export interface DrawingViewportProjection {
  readonly x: number;
  readonly y: number;
}

const viewportPoint = (point: DrawingPoint, projection: DrawingViewportProjection) => ({
  x: point.x - projection.x,
  y: point.y - projection.y,
});

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
  if (object.backgroundColor) {
    context.fillStyle = object.backgroundColor;
    context.beginPath();
    context.roundRect(x, y, bounds.width, bounds.height, 4);
    context.fill();
  }
  context.fillStyle = object.color;
  context.font = `${object.fontSize}px system-ui, sans-serif`;
  context.textBaseline = 'top';
  const lineHeight = object.fontSize * 1.25;
  const maxWidth = Math.max(1, bounds.width - 12);
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
  lines.forEach((line, index) => context.fillText(line, x + 6, y + 6 + index * lineHeight));
}

function strokePolygon(
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
  context.stroke();
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
    strokePolygon(context, object, projection);
  } else if (object.kind === 'ellipse') {
    const bounds = getDrawingObjectBounds(object);
    context.strokeStyle = object.color;
    context.lineWidth = object.width;
    context.beginPath();
    context.ellipse(
      bounds.x + bounds.width / 2 - projection.x,
      bounds.y + bounds.height / 2 - projection.y,
      bounds.width / 2,
      bounds.height / 2,
      0,
      0,
      Math.PI * 2
    );
    context.stroke();
  } else if (object.kind === 'arrow') {
    context.fillStyle = object.color;
    fillPolygon(context, buildDrawingArrowOutline(object), projection);
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
            { x, y },
            { x: x + bounds.width, y },
            { x: x + bounds.width, y: y + bounds.height },
            { x, y: y + bounds.height },
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
  context.restore();
}
