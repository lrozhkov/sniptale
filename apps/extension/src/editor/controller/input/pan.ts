import type { PanSession } from '../core/types';

export function shouldStartViewportPan(event: MouseEvent, isSpacePressed: boolean): boolean {
  return event.button === 1 || (event.button === 0 && isSpacePressed);
}

export function createViewportPanSession(
  viewportElement: HTMLElement,
  event: MouseEvent
): PanSession {
  return {
    startX: event.clientX,
    startY: event.clientY,
    scrollLeft: viewportElement.scrollLeft,
    scrollTop: viewportElement.scrollTop,
  };
}

export function applyViewportPanSession(
  viewportElement: HTMLElement,
  panSession: PanSession,
  event: MouseEvent
): void {
  const deltaX = event.clientX - panSession.startX;
  const deltaY = event.clientY - panSession.startY;
  viewportElement.scrollLeft = panSession.scrollLeft - deltaX;
  viewportElement.scrollTop = panSession.scrollTop - deltaY;
}
