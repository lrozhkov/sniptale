import type { MutableRefObject } from 'react';
import { getViewportClientPoint } from '../../../platform/frame';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { isHighlighterEnabled, isHighlighterPausedState } from '../../highlighter';
import {
  getCombinedFrameFloatingUiRect,
  getDistanceToFrameFloatingUiRect,
} from './floating-bounds';

const HIDE_DISTANCE_THRESHOLD = 200;
const TOP_BORDER_TOLERANCE_OUT = 10;
const TOP_BORDER_TOLERANCE_IN = 3;
const HOVER_THROTTLE_MS = 100;
const TOOLTIP_ZONE_WIDTH = 300;
const TOOLTIP_ZONE_HEIGHT = 30;

export type FrameUiMouseTrackingParams = {
  handleMouseMove: (event: MouseEvent, iframe?: HTMLIFrameElement) => void;
  lastMouseX: MutableRefObject<number>;
  lastMouseY: MutableRefObject<number>;
  lastProcessTime: MutableRefObject<number>;
  rafId: MutableRefObject<number | null>;
};

function isInsideTooltipZone(frame: FrameData, x: number, y: number) {
  const effectiveWidth = Math.min(frame.width, TOOLTIP_ZONE_WIDTH);

  return (
    x >= frame.x &&
    x <= frame.x + effectiveWidth &&
    y >= frame.y - TOP_BORDER_TOLERANCE_OUT &&
    y <= frame.y + TOP_BORDER_TOLERANCE_IN + TOOLTIP_ZONE_HEIGHT
  );
}

/**
 * Decides whether tooltip should open, stay, or be hidden for current mouse position.
 */
export function processFrameHover(params: {
  frames: FrameData[];
  activeFrameId: string | null;
  popoverFrameId: string | null;
  showTooltip: (frameId: string) => void;
  hideTooltip: (frameId: string) => void;
  x: number;
  y: number;
}) {
  const { frames, activeFrameId, popoverFrameId, showTooltip, hideTooltip, x, y } = params;

  if (!isHighlighterEnabled() || isHighlighterPausedState() || frames.length === 0) {
    return;
  }

  if (activeFrameId === null && popoverFrameId === null) {
    for (const frame of frames) {
      if (isInsideTooltipZone(frame, x, y)) {
        showTooltip(frame.id);
        return;
      }
    }
  }

  if (activeFrameId === null || popoverFrameId !== null) {
    return;
  }

  const combinedRect = getCombinedFrameFloatingUiRect();

  if (!combinedRect) {
    return;
  }

  if (getDistanceToFrameFloatingUiRect(x, y, combinedRect) >= HIDE_DISTANCE_THRESHOLD) {
    hideTooltip(activeFrameId);
  }
}

/**
 * Builds a throttled mousemove listener backed by RAF.
 */
export function createThrottledMouseMoveHandler(params: FrameUiMouseTrackingParams) {
  const { handleMouseMove, lastMouseX, lastMouseY, lastProcessTime, rafId } = params;

  return (event: MouseEvent, iframe?: HTMLIFrameElement) => {
    if (!isHighlighterEnabled() || isHighlighterPausedState()) {
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
