import { drawPointerFeedbackFrame, type PointerFeedbackSource } from '../pointer-feedback';
import { getActionClickStyle } from '../../../project/action-style';
import { applyTemporalEasing } from '../../motion';
import type { VideoCompositionActionState, VideoCompositionCameraState } from '../../types';
import { drawKeystroke } from './keystrokes';

export function drawActionCompositionState(
  context: CanvasRenderingContext2D,
  action: VideoCompositionActionState,
  fallbackPoint: { x: number; y: number } | null,
  sizeScale = 1,
  bounds?: { x: number; y: number; width: number; height: number },
  source?: PointerFeedbackSource
): void {
  if (action.renderKind === null) return;
  if (action.renderKind === 'keystroke') {
    drawKeystroke(context, action, sizeScale, bounds);
    return;
  }
  const point = action.point ?? fallbackPoint;
  if (!point || action.preset === 'NONE' || action.preset === 'SCROLL_EMPHASIS') return;
  if (action.gestureFeedback) {
    const frame = action.gestureFeedback;
    if (!frame.path?.length) {
      drawPointerFeedbackFrame(
        context,
        {
          ...frame,
          point,
          radius: frame.radius * sizeScale,
          stroke: frame.stroke * Math.max(0.2, sizeScale),
        },
        source
      );
      return;
    }
    context.save();
    context.globalAlpha *= frame.opacity;
    context.strokeStyle = frame.color;
    context.fillStyle = frame.color;
    context.lineWidth = frame.stroke * Math.max(0.2, sizeScale);
    if (frame.path?.length) {
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.beginPath();
      const scale = Math.max(0.2, sizeScale);
      const path = simplifyGesturePath(frame.path, Math.max(4, frame.stroke * 3) * scale);
      traceGesturePath(context, path, Math.max(12, frame.stroke * 6) * scale);
      context.stroke();
    }
    if (frame.area)
      context.strokeRect(frame.area.x, frame.area.y, frame.area.width, frame.area.height);
    context.beginPath();
    context.arc(point.x, point.y, Math.max(0.01, frame.radius * sizeScale), 0, Math.PI * 2);
    context.fill();
    context.restore();
    return;
  }
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

/** Display-only geometric tolerance removes capture jitter; telemetry and endpoints stay exact. */
function simplifyGesturePath(points: readonly { x: number; y: number }[], tolerance: number) {
  if (points.length < 3) return points;
  const kept = new Set([0, points.length - 1]);
  const pending: [number, number][] = [[0, points.length - 1]];
  while (pending.length) {
    const [start, end] = pending.pop()!;
    const first = points[start]!;
    const last = points[end]!;
    const dx = last.x - first.x,
      dy = last.y - first.y;
    const length = dx * dx + dy * dy;
    let worst = tolerance * tolerance;
    let selected = -1;
    for (let index = start + 1; index < end; index++) {
      const point = points[index]!;
      const along = length
        ? Math.max(0, Math.min(1, ((point.x - first.x) * dx + (point.y - first.y) * dy) / length))
        : 0;
      const distance =
        (point.x - first.x - along * dx) ** 2 + (point.y - first.y - along * dy) ** 2;
      if (distance > worst) {
        worst = distance;
        selected = index;
      }
    }
    if (selected >= 0) {
      kept.add(selected);
      pending.push([start, selected], [selected, end]);
    }
  }
  return [...kept].sort((a, b) => a - b).map((index) => points[index]!);
}

/** Round only local corners; recorded endpoints and the current pointer stay exact. */
function traceGesturePath(
  context: CanvasRenderingContext2D,
  points: readonly { x: number; y: number }[],
  radius: number
) {
  const first = points[0]!;
  context.moveTo(first.x, first.y);
  for (let index = 1; index < points.length - 1; index++) {
    const before = points[index - 1]!;
    const point = points[index]!;
    const after = points[index + 1]!;
    const incoming = Math.hypot(point.x - before.x, point.y - before.y);
    const outgoing = Math.hypot(after.x - point.x, after.y - point.y);
    const distance = Math.min(radius, incoming / 2, outgoing / 2);
    if (distance <= 0) {
      context.lineTo(point.x, point.y);
      continue;
    }
    context.lineTo(
      point.x + ((before.x - point.x) * distance) / incoming,
      point.y + ((before.y - point.y) * distance) / incoming
    );
    context.quadraticCurveTo(
      point.x,
      point.y,
      point.x + ((after.x - point.x) * distance) / outgoing,
      point.y + ((after.y - point.y) * distance) / outgoing
    );
  }
  const last = points.at(-1)!;
  if (points.length > 1) context.lineTo(last.x, last.y);
}

/** Source bounds precede camera projection; callers supply the same raster state as the painter. */
export function resolveActionCompositionPaintBounds(
  action: VideoCompositionActionState,
  sizeScale = 1
) {
  const point = action.point;
  if (
    !point ||
    action.renderKind !== 'accent' ||
    action.preset === 'NONE' ||
    action.preset === 'SCROLL_EMPHASIS'
  )
    return null;
  const style = getActionClickStyle(action.clickStyle);
  const feedback = action.gestureFeedback;
  const radius = feedback
    ? Math.max(0.01, feedback.radius * sizeScale)
    : style.size * Math.max(0.2, sizeScale);
  const stroke = ((feedback?.stroke ?? style.strokeWidth) * Math.max(0.2, sizeScale)) / 2 + 2;
  let x = point.x - radius,
    y = point.y - radius;
  let right = point.x + radius,
    bottom = point.y + radius;
  for (const item of feedback?.path ?? []) {
    x = Math.min(x, item.x);
    y = Math.min(y, item.y);
    right = Math.max(right, item.x);
    bottom = Math.max(bottom, item.y);
  }
  if (feedback?.area) {
    x = Math.min(x, feedback.area.x);
    y = Math.min(y, feedback.area.y);
    right = Math.max(right, feedback.area.x + feedback.area.width);
    bottom = Math.max(bottom, feedback.area.y + feedback.area.height);
  }
  return {
    x: x - stroke,
    y: y - stroke,
    width: right - x + stroke * 2,
    height: bottom - y + stroke * 2,
  };
}

/** Shared manual-action overlay mapping for preview and exported output. */
export function drawSceneActionCompositionStates(
  context: CanvasRenderingContext2D,
  actions: readonly VideoCompositionActionState[],
  camera: VideoCompositionCameraState,
  viewport: { offsetX: number; offsetY: number; scaleX: number; scaleY: number }
): void {
  const viewportScale = (viewport.scaleX + viewport.scaleY) / 2;
  const bounds = {
    x: viewport.offsetX,
    y: viewport.offsetY,
    width: camera.viewportWidth * camera.scale * viewport.scaleX,
    height: camera.viewportHeight * camera.scale * viewport.scaleY,
  };
  for (const action of actions) {
    const sizeScale =
      action.renderKind === 'keystroke' && action.keyStyleViewportWidth
        ? bounds.width / action.keyStyleViewportWidth
        : viewportScale * (action.renderKind !== 'keystroke' && action.point ? camera.scale : 1);
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
    drawActionCompositionState(context, { ...action, point }, null, sizeScale, bounds);
  }
}
