import type { VideoCompositionActionState } from '../../types';
export function drawActionCompositionState(
  context: CanvasRenderingContext2D,
  action: VideoCompositionActionState,
  fallbackPoint: { x: number; y: number } | null,
  sizeScale = 1
): void {
  const point = action.point ?? fallbackPoint;
  if (!point) {
    return;
  }

  context.save();

  switch (action.event.preset) {
    case 'CLICK_RIPPLE':
    case 'NONE':
      drawRipple(context, point.x, point.y, action.progress, sizeScale);
      break;
    case 'SCROLL_EMPHASIS':
      return;
    case 'SPOTLIGHT':
      drawSpotlight(context, point.x, point.y, action.progress, sizeScale);
      break;
    case 'DWELL_ZOOM':
      drawDwellZoom(context, point.x, point.y, action.progress, sizeScale);
      break;
  }

  context.restore();
}

function drawRipple(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  progress: number,
  sizeScale: number
): void {
  const alpha = 0.75 * (1 - progress);
  const radius = scaleActionSize(18 + progress * 28, sizeScale);

  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.lineWidth = scaleActionSize(4, sizeScale);
  context.strokeStyle = `rgba(249, 115, 22, ${alpha.toFixed(3)})`;
  context.stroke();
}

function drawSpotlight(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  progress: number,
  sizeScale: number
): void {
  const radius = scaleActionSize(40 + progress * 8, sizeScale);
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, 'rgba(249, 115, 22, 0.28)');
  gradient.addColorStop(1, 'rgba(249, 115, 22, 0)');
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

function drawDwellZoom(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  progress: number,
  sizeScale: number
): void {
  const radius = scaleActionSize(22 + progress * 12, sizeScale);
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.lineWidth = scaleActionSize(5, sizeScale);
  context.strokeStyle = 'rgba(59, 130, 246, 0.42)';
  context.stroke();
}

function scaleActionSize(value: number, sizeScale: number): number {
  const clampedScale = Math.max(0.2, sizeScale);
  return value * clampedScale;
}
