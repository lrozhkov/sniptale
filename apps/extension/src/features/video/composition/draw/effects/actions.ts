import type { VideoCompositionActionState, VideoCompositionCameraState } from '../../types';
export function drawActionCompositionState(
  context: CanvasRenderingContext2D,
  action: VideoCompositionActionState,
  fallbackPoint: { x: number; y: number } | null,
  sizeScale = 1,
  bounds?: { x: number; y: number; width: number; height: number }
): void {
  if (action.renderKind === null || (action.renderKind === 'accent' && action.preset === 'NONE'))
    return;
  if (action.renderKind === 'keystroke') {
    drawKeystroke(context, action, sizeScale, bounds);
    return;
  }
  const point = action.point ?? fallbackPoint;
  if (!point) {
    return;
  }

  context.save();

  switch (action.preset) {
    case 'CLICK_RIPPLE':
      drawRipple(context, point.x, point.y, action.progress, sizeScale);
      break;
    case 'SCROLL_EMPHASIS':
    case 'NONE':
      break;
    case 'SPOTLIGHT':
      drawSpotlight(context, point.x, point.y, action.progress, sizeScale);
      break;
    case 'DWELL_ZOOM':
      drawDwellZoom(context, point.x, point.y, action.progress, sizeScale);
      break;
  }

  context.restore();
}

function drawKeystroke(
  context: CanvasRenderingContext2D,
  action: VideoCompositionActionState,
  sizeScale: number,
  bounds?: { x: number; y: number; width: number; height: number }
): void {
  const label = action.event.label;
  if (!label) return;
  const scale = Math.max(0.2, sizeScale);
  const point = action.point ?? { x: 24 * scale, y: 48 * scale };
  context.save();
  context.font = `${18 * scale}px sans-serif`;
  context.textBaseline = 'middle';
  const width = Math.min(
    context.measureText(label).width + 24 * scale,
    bounds ? Math.max(0, bounds.x + bounds.width - point.x) : Infinity
  );
  context.fillStyle = 'rgba(15, 23, 42, 0.9)';
  context.fillRect(point.x, point.y - 18 * scale, width, 36 * scale);
  context.fillStyle = '#ffffff';
  context.fillText(label, point.x + 12 * scale, point.y, Math.max(1, width - 24 * scale));
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

/** Shared manual-action overlay mapping for preview and exported output. */
export function drawSceneActionCompositionStates(
  context: CanvasRenderingContext2D,
  actions: readonly VideoCompositionActionState[],
  camera: VideoCompositionCameraState,
  viewport: { offsetX: number; offsetY: number; scaleX: number; scaleY: number }
): void {
  const viewportScale = (viewport.scaleX + viewport.scaleY) / 2;
  for (const action of actions) {
    const sizeScale = viewportScale * (action.point ? camera.scale : 1);
    const point = action.point
      ? {
          x:
            viewport.offsetX + (action.point.x - camera.viewportX) * camera.scale * viewport.scaleX,
          y:
            viewport.offsetY + (action.point.y - camera.viewportY) * camera.scale * viewport.scaleY,
        }
      : action.renderKind === 'keystroke'
        ? {
            x: viewport.offsetX + 24 * viewport.scaleX,
            y: viewport.offsetY + 48 * viewport.scaleY,
          }
        : null;
    drawActionCompositionState(context, { ...action, point }, null, sizeScale);
  }
}
