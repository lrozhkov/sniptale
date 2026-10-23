import type { VideoCompositionCursorState } from '../../types';

const ARROW_STROKE_WIDTH = 1.5;
const ARROW_MITER_LIMIT = 10;

export function drawCursorCompositionState(
  context: CanvasRenderingContext2D,
  cursor: VideoCompositionCursorState
): void {
  if (!cursor.visible) {
    return;
  }

  context.save();
  context.translate(cursor.x, cursor.y);
  context.translate(0, resolveCursorAnimationOffsetY(cursor));
  context.scale(
    cursor.scale * resolveCursorAnimationScale(cursor),
    cursor.scale * resolveCursorAnimationScale(cursor)
  );

  if (cursor.shadow) {
    context.shadowBlur = 16;
    context.shadowColor = 'rgba(15, 23, 42, 0.28)';
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 6;
  }

  switch (cursor.preset) {
    case 'DOT':
      drawDotCursor(context, cursor.color);
      break;
    case 'RING':
      drawRingCursor(context, cursor.color);
      break;
    case 'CROSSHAIR':
      drawCrosshairCursor(context, cursor.color);
      break;
    case 'ARROW':
      drawArrowCursor(context, cursor.color);
      break;
  }
  context.restore();
}

/** Bounds use the painter's raster coordinates, including its unscaled shadow and float offset. */
export function resolveCursorCompositionPaintBounds(cursor: VideoCompositionCursorState) {
  if (!cursor.visible) return null;
  const scale = cursor.scale * resolveCursorAnimationScale(cursor);
  // Acute arrow corners extend beyond half the stroke: include the painter's miter limit.
  const glyph =
    cursor.preset === 'ARROW'
      ? {
          x: (-ARROW_STROKE_WIDTH * ARROW_MITER_LIMIT) / 2,
          y: (-ARROW_STROKE_WIDTH * ARROW_MITER_LIMIT) / 2,
          width: 24 + ARROW_STROKE_WIDTH * ARROW_MITER_LIMIT,
          height: 34 + ARROW_STROKE_WIDTH * ARROW_MITER_LIMIT,
        }
      : cursor.preset === 'DOT'
        ? { x: -9, y: -9, width: 18, height: 18 }
        : cursor.preset === 'RING'
          ? { x: -11.5, y: -11.5, width: 23, height: 23 }
          : { x: -15, y: -15, width: 30, height: 30 };
  // Three blur radii preserve the existing canvas-shadow capture support.
  const blur = cursor.shadow ? 48 : 0;
  return {
    x: cursor.x + glyph.x * scale - blur - 2,
    y: cursor.y + resolveCursorAnimationOffsetY(cursor) + glyph.y * scale - blur - 2,
    width: glyph.width * scale + blur * 2 + 4,
    height: glyph.height * scale + blur * 2 + (cursor.shadow ? 6 : 0) + 4,
  };
}

function resolveCursorAnimationScale(cursor: VideoCompositionCursorState): number {
  const phase = cursor.time * Math.PI * 2;

  switch (cursor.animationPreset) {
    case 'PULSE':
      return 1 + Math.sin(phase * 3) * 0.06;
    case 'BREATHE':
      return 1 + Math.sin(phase * 1.2) * 0.04;
    case 'PRESS':
    case 'FLOAT':
    case 'NONE':
      return 1;
  }
}

function resolveCursorAnimationOffsetY(cursor: VideoCompositionCursorState): number {
  if (cursor.animationPreset !== 'FLOAT') {
    return 0;
  }

  return Math.sin(cursor.time * Math.PI * 2 * 1.4) * -1.5;
}

function drawArrowCursor(context: CanvasRenderingContext2D, color: string): void {
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(0, 28);
  context.lineTo(8, 22);
  context.lineTo(14, 34);
  context.lineTo(19, 31);
  context.lineTo(13, 20);
  context.lineTo(24, 20);
  context.closePath();
  context.fillStyle = color;
  context.fill();
  context.lineWidth = ARROW_STROKE_WIDTH;
  context.lineJoin = 'miter';
  context.miterLimit = ARROW_MITER_LIMIT;
  context.strokeStyle = 'rgba(255, 255, 255, 0.88)';
  context.stroke();
}

function drawDotCursor(context: CanvasRenderingContext2D, color: string): void {
  context.beginPath();
  context.arc(0, 0, 8, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
  context.lineWidth = 2;
  context.strokeStyle = 'rgba(255, 255, 255, 0.88)';
  context.stroke();
}

function drawRingCursor(context: CanvasRenderingContext2D, color: string): void {
  context.beginPath();
  context.arc(0, 0, 10, 0, Math.PI * 2);
  context.lineWidth = 3;
  context.strokeStyle = color;
  context.stroke();
  context.beginPath();
  context.arc(0, 0, 3, 0, Math.PI * 2);
  context.fillStyle = 'rgba(255, 255, 255, 0.92)';
  context.fill();
}

function drawCrosshairCursor(context: CanvasRenderingContext2D, color: string): void {
  context.beginPath();
  context.arc(0, 0, 7, 0, Math.PI * 2);
  context.lineWidth = 2;
  context.strokeStyle = color;
  context.stroke();

  context.beginPath();
  context.moveTo(-14, 0);
  context.lineTo(-6, 0);
  context.moveTo(6, 0);
  context.lineTo(14, 0);
  context.moveTo(0, -14);
  context.lineTo(0, -6);
  context.moveTo(0, 6);
  context.lineTo(0, 14);
  context.lineWidth = 2;
  context.strokeStyle = color;
  context.stroke();
}
