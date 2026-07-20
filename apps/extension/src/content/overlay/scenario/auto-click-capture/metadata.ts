import { getViewportClientPoint } from '../../../platform/frame/core';
import type {
  ScenarioCaptureMetadata,
  ScenarioPoint,
} from '@sniptale/runtime-contracts/scenario/types/geometry';
import { buildScenarioPoint } from '../../scenario-recorder/runtime';

export type PendingPointerCapture = {
  endPoint: ScenarioPoint;
  iframe?: HTMLIFrameElement;
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
  scrollStartX: number;
  scrollStartY: number;
  startPoint: ScenarioPoint;
  startedAt: number;
  target: HTMLElement;
};

export function getScrollPosition(iframe?: HTMLIFrameElement) {
  const frameWindow = iframe?.contentWindow;
  const view = frameWindow ?? window;
  return {
    x: view.scrollX ?? 0,
    y: view.scrollY ?? 0,
  };
}

export function buildInteractionPoint(args: {
  clientX: number;
  clientY: number;
  iframe?: HTMLIFrameElement;
}) {
  if (args.iframe) {
    return getViewportClientPoint(args.clientX, args.clientY, args.iframe);
  }

  return buildScenarioPoint(args.clientX, args.clientY);
}

export function buildKeyboardInteractionPoint(target: HTMLElement, iframe?: HTMLIFrameElement) {
  const rect = target.getBoundingClientRect();
  return buildInteractionPoint({
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
    ...(iframe === undefined ? {} : { iframe }),
  });
}

export function updatePendingPointerRange(
  pendingPointerCapture: PendingPointerCapture,
  point: ScenarioPoint
) {
  pendingPointerCapture.endPoint = point;
  pendingPointerCapture.minX = Math.min(pendingPointerCapture.minX, point.x);
  pendingPointerCapture.minY = Math.min(pendingPointerCapture.minY, point.y);
  pendingPointerCapture.maxX = Math.max(pendingPointerCapture.maxX, point.x);
  pendingPointerCapture.maxY = Math.max(pendingPointerCapture.maxY, point.y);
}

export function buildPointerCaptureMetadata(
  pendingPointerCapture: PendingPointerCapture
): ScenarioCaptureMetadata {
  const scrollEnd = getScrollPosition(pendingPointerCapture.iframe);
  const deltaX = pendingPointerCapture.endPoint.x - pendingPointerCapture.startPoint.x;
  const deltaY = pendingPointerCapture.endPoint.y - pendingPointerCapture.startPoint.y;

  return {
    pointerRange: {
      start: pendingPointerCapture.startPoint,
      end: pendingPointerCapture.endPoint,
      minX: pendingPointerCapture.minX,
      minY: pendingPointerCapture.minY,
      maxX: pendingPointerCapture.maxX,
      maxY: pendingPointerCapture.maxY,
      distance: Math.sqrt(deltaX ** 2 + deltaY ** 2),
      durationMs: Math.max(0, Date.now() - pendingPointerCapture.startedAt),
    },
    scroll: {
      startX: pendingPointerCapture.scrollStartX,
      startY: pendingPointerCapture.scrollStartY,
      endX: scrollEnd.x,
      endY: scrollEnd.y,
      deltaX: scrollEnd.x - pendingPointerCapture.scrollStartX,
      deltaY: scrollEnd.y - pendingPointerCapture.scrollStartY,
    },
    trigger: 'pointer-up',
  };
}
