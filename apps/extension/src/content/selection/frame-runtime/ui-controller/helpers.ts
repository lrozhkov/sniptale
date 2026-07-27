import type { MutableRefObject } from 'react';
import { getViewportClientPoint } from '../../../platform/frame';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { isHighlighterEnabled, isHighlighterPausedState } from '../../highlighter';
import { resolveFrameControlHit, resolveFrameHitTarget, type FrameHitTarget } from './hit-test';
import { isFrameUiOwnedFloatingEvent } from './activation';

const HOVER_THROTTLE_MS = 100;

export type FrameUiMouseTrackingParams = {
  handleMouseMove: (event: MouseEvent, iframe?: HTMLIFrameElement) => void;
  lastMouseX: MutableRefObject<number>;
  lastMouseY: MutableRefObject<number>;
  lastProcessTime: MutableRefObject<number>;
  rafId: MutableRefObject<number | null>;
};

/**
 * Resolves the single border/control winner for hover trigger and resize proximity.
 */
export function processFrameHover(params: {
  frames: FrameData[];
  directControl: FrameHitTarget | null;
  hoveredFrameId: string | null;
  selectedFrameId: string | null;
  isDrawing: boolean;
  hoverFrame: (frameId: string) => void;
  scheduleHoverFrameHide: (frameId: string) => void;
  clearHoverFrame: () => void;
  setResizeFrame: (frameId: string | null) => void;
  x: number;
  y: number;
}) {
  if (isHighlighterPausedState() || params.frames.length === 0 || params.isDrawing) {
    params.setResizeFrame(null);
    params.clearHoverFrame();
    return;
  }

  const winner = resolveFrameHitTarget({
    directControl: params.directControl,
    frames: params.frames,
    hoveredFrameId: params.hoveredFrameId,
    selectedFrameId: params.selectedFrameId,
    x: params.x,
    y: params.y,
  });
  params.setResizeFrame(winner?.kind === 'trigger' ? null : (winner?.frameId ?? null));

  if (!isHighlighterEnabled()) {
    params.clearHoverFrame();
    return;
  }

  if (winner) {
    params.hoverFrame(winner.frameId);
    return;
  }

  if (params.hoveredFrameId) {
    params.scheduleHoverFrameHide(params.hoveredFrameId);
  }
}

/**
 * Builds a throttled mousemove listener backed by RAF.
 */
export function createThrottledMouseMoveHandler(
  params: FrameUiMouseTrackingParams & { clearResizeFrame: () => void }
) {
  const { clearResizeFrame, handleMouseMove, lastMouseX, lastMouseY, lastProcessTime, rafId } =
    params;

  return (event: MouseEvent, iframe?: HTMLIFrameElement) => {
    if (isHighlighterPausedState()) {
      return;
    }
    if (isFrameUiOwnedFloatingEvent(event)) {
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
      if (resolveFrameControlHit(event)?.kind !== 'resize-handle') {
        clearResizeFrame();
      }
      return;
    }

    const point = getViewportClientPoint(event.clientX, event.clientY, iframe);
    const dx = Math.abs(point.x - lastMouseX.current);
    const dy = Math.abs(point.y - lastMouseY.current);

    if (dx < 2 && dy < 2) {
      return;
    }

    const now = Date.now();
    if (now - lastProcessTime.current < HOVER_THROTTLE_MS || rafId.current !== null) {
      return;
    }

    lastMouseX.current = point.x;
    lastMouseY.current = point.y;
    lastProcessTime.current = now;

    rafId.current = requestAnimationFrame(() => {
      handleMouseMove(event, iframe);
      rafId.current = null;
    });
  };
}
