import type { VideoProjectTransform } from '../../../../../features/video/project/types';
import {
  hasCrossedPreviewTransformThreshold,
  type PreviewTransformClientPoint,
  type PreviewTransformGestureState,
} from './state';

type PreviewTransformSettleReason = 'cancel' | 'commit';

export interface PreviewTransformGestureHooks {
  onActivate?: (clipId: string) => void;
  onBegin?: (clipId: string) => void;
  onCacheBypassChange?: (active: boolean) => void;
  onPreviewTransform?: (clipId: string, transform: VideoProjectTransform | null) => void;
  onRestore?: (clipId: string) => void;
  onSettle?: (reason: PreviewTransformSettleReason) => void;
}

interface PreviewTransformGestureParams extends PreviewTransformGestureHooks {
  onCommit: (clipId: string, transform: VideoProjectTransform) => void;
  onFinish?: () => void;
  resolveTransform: (point: PreviewTransformClientPoint) => VideoProjectTransform;
  state: PreviewTransformGestureState;
}

function readPointerPoint(event: PointerEvent): PreviewTransformClientPoint {
  return { clientX: event.clientX, clientY: event.clientY };
}

function hasFinitePointerPoint(point: PreviewTransformClientPoint): boolean {
  return Number.isFinite(point.clientX) && Number.isFinite(point.clientY);
}

function updatePreviewTransform(params: PreviewTransformGestureParams): VideoProjectTransform {
  const transform = params.resolveTransform(params.state.latestPoint);
  params.state.previewTransform = { ...transform };
  params.onPreviewTransform?.(params.state.clipId, params.state.previewTransform);
  return transform;
}

function schedulePreviewTransform(params: PreviewTransformGestureParams): void {
  if (params.state.animationFrameId !== null) {
    return;
  }
  params.state.animationFrameId = requestAnimationFrame(() => {
    params.state.animationFrameId = null;
    if (!params.state.finished) {
      updatePreviewTransform(params);
    }
  });
}

function activateGesture(
  params: PreviewTransformGestureParams,
  point: PreviewTransformClientPoint
): void {
  if (params.state.activated || !hasCrossedPreviewTransformThreshold(params.state.origin, point)) {
    return;
  }
  params.state.activated = true;
  params.onActivate?.(params.state.clipId);
}

function removeGestureListeners(
  move: (event: PointerEvent) => void,
  up: (event: PointerEvent) => void,
  cancel: (event: PointerEvent) => void
): void {
  window.removeEventListener('pointermove', move);
  window.removeEventListener('pointerup', up);
  window.removeEventListener('pointercancel', cancel);
}

export function startPreviewTransformGesture(params: PreviewTransformGestureParams): () => void {
  const finish = (reason: PreviewTransformSettleReason) => {
    if (params.state.finished) return;
    params.state.finished = true;
    if (params.state.animationFrameId !== null) cancelAnimationFrame(params.state.animationFrameId);
    removeGestureListeners(handleMove, handleUp, handleCancel);
    if (reason === 'commit') {
      const transform = updatePreviewTransform(params);
      params.onCommit(params.state.clipId, transform);
    } else {
      params.onRestore?.(params.state.clipId);
    }
    if (params.state.activated) params.onPreviewTransform?.(params.state.clipId, null);
    params.onCacheBypassChange?.(false);
    params.onSettle?.(reason);
    params.onFinish?.();
  };
  const handleMove = (event: PointerEvent) => {
    params.state.latestPoint = readPointerPoint(event);
    activateGesture(params, params.state.latestPoint);
    if (params.state.activated) schedulePreviewTransform(params);
  };
  const handleUp = (event: PointerEvent) => {
    const point = readPointerPoint(event);
    if (hasFinitePointerPoint(point)) {
      params.state.latestPoint = point;
      activateGesture(params, point);
    }
    finish(params.state.activated ? 'commit' : 'cancel');
  };
  const handleCancel = () => finish('cancel');

  params.onBegin?.(params.state.clipId);
  params.onCacheBypassChange?.(true);
  window.addEventListener('pointermove', handleMove);
  window.addEventListener('pointerup', handleUp);
  window.addEventListener('pointercancel', handleCancel);
  return handleCancel;
}
