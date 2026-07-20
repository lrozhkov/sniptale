import type { VideoCompositionCursorState } from '../../types';

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

function resolveCursorAnimationScale(cursor: VideoCompositionCursorState): number {
  const phase = cursor.time * Math.PI * 2;

  switch (cursor.animationPreset) {
    case 'PULSE':
      return 1 + Math.sin(phase * 3) * 0.06;
    case 'BREATHE':
      return 1 + Math.sin(phase * 1.2) * 0.04;
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
  context.lineWidth = 1.5;
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
