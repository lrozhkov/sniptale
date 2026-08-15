import { buildDrawingStrokeOutline, type DrawingObject } from '../../features/drawing/public';

export function renderEditorFreehandPreview(
  context: CanvasRenderingContext2D,
  drawing: Extract<DrawingObject, { kind: 'pencil' | 'marker' }>
): boolean {
  const outline = buildDrawingStrokeOutline(drawing.samples, drawing.width, {
    dynamicWidth: drawing.kind === 'pencil',
    smoothingLevel: 10,
  });
  const first = outline[0];
  if (!first) return false;

  context.save();
  context.beginPath();
  context.moveTo(first.x, first.y);
  outline.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  context.closePath();
  context.fillStyle = drawing.color;
  context.globalAlpha *= drawing.kind === 'marker' ? drawing.opacity : 1;
  context.fill();
  context.restore();
  return true;
}
