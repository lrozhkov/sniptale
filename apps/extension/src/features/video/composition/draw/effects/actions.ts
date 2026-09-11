import { getActionClickStyle } from '../../../project/action-style';
import { applyTemporalEasing } from '../../motion';
import type { VideoCompositionActionState, VideoCompositionCameraState } from '../../types';
import { drawKeystroke } from './keystrokes';

export function drawActionCompositionState(
  context: CanvasRenderingContext2D,
  action: VideoCompositionActionState,
  fallbackPoint: { x: number; y: number } | null,
  sizeScale = 1,
  bounds?: { x: number; y: number; width: number; height: number }
): void {
  if (action.renderKind === null) return;
  if (action.renderKind === 'keystroke') {
    drawKeystroke(context, action, sizeScale, bounds);
    return;
  }
  const point = action.point ?? fallbackPoint;
  if (!point || action.preset === 'NONE' || action.preset === 'SCROLL_EMPHASIS') return;
  const style = getActionClickStyle(action.clickStyle);
  const p = Math.min(1, Math.max(0, action.progress));
  const eased = applyTemporalEasing(p, action.easing ?? 'EASE_OUT');
  const size = style.size * Math.max(0.2, sizeScale);
  const envelope = Math.min(1, p / 0.08) * (1 - p);
  context.save();
  context.globalAlpha *= style.opacity * envelope;
  context.strokeStyle = style.color;
  context.fillStyle = style.color;
  context.lineWidth = style.strokeWidth * Math.max(0.2, sizeScale);
  context.beginPath();
  switch (action.preset) {
    case 'CLICK_RIPPLE':
      context.arc(point.x, point.y, size * (0.3 + 0.7 * eased), 0, Math.PI * 2);
      context.stroke();
      break;
    case 'SPOTLIGHT': {
      const radius = size * (0.85 + 0.15 * eased);
      const gradient = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
      gradient.addColorStop(0, style.color);
      gradient.addColorStop(1, 'transparent');
      context.globalAlpha *= 0.55;
      context.fillStyle = gradient;
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();
      break;
    }
    case 'CLICK_PRESS':
    case 'DWELL_ZOOM':
      context.arc(
        point.x,
        point.y,
        size * (0.3 + 0.18 * Math.sin(eased * Math.PI)),
        0,
        Math.PI * 2
      );
      context.globalAlpha *= 0.5;
      context.fill();
      context.globalAlpha *= 2;
      context.stroke();
      break;
  }
  context.restore();
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
    const sizeScale =
      viewportScale * (action.renderKind !== 'keystroke' && action.point ? camera.scale : 1);
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
    drawActionCompositionState(context, { ...action, point }, null, sizeScale, {
      x: viewport.offsetX,
      y: viewport.offsetY,
      width: camera.viewportWidth * camera.scale * viewport.scaleX,
      height: camera.viewportHeight * camera.scale * viewport.scaleY,
    });
  }
}
