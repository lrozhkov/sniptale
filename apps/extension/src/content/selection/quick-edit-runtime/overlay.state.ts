export interface QuickEditOverlayState {
  hoverOverlay: HTMLElement | null;
  blockingOverlay: HTMLElement | null;
  activeFrameOverlay: HTMLElement | null;
  resizeObserver: ResizeObserver | null;
  cursorStyleElement: HTMLStyleElement | null;
  cleanupCursorStyle: (() => void) | null;
}

export function createQuickEditOverlayState(): QuickEditOverlayState {
  return {
    hoverOverlay: null,
    blockingOverlay: null,
    activeFrameOverlay: null,
    resizeObserver: null,
    cursorStyleElement: null,
    cleanupCursorStyle: null,
  };
}

export function setupQuickEditResizeObserver(
  state: QuickEditOverlayState,
  element: HTMLElement,
  onResize: () => void
): void {
  state.resizeObserver?.disconnect();
  state.resizeObserver = new ResizeObserver(onResize);
  state.resizeObserver.observe(element);
}

export function disconnectQuickEditResizeObserver(state: QuickEditOverlayState): void {
  state.resizeObserver?.disconnect();
  state.resizeObserver = null;
}
