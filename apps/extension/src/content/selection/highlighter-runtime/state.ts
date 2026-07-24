type HighlighterFrameCallbacks = {
  addFrame: ((element: HTMLElement) => void) | null;
  removeFrame: ((frameId: string) => void) | null;
  clearFrames: (() => void) | null;
  hasFrameForElement: ((element: HTMLElement) => boolean) | null;
};

export type HighlighterRuntimeState = {
  isModeEnabled: boolean;
  isPaused: boolean;
  isFrameEditing: boolean;
  isTooltipVisible: boolean;
  cleanupEventListeners: (() => void) | null;
  callbacks: HighlighterFrameCallbacks;
};

interface HighlighterHoverUiController {
  cancelPendingHoverFrame(): void;
  clearHoverTracking(): void;
  hideHoverOverlay(): void;
  removeHoverOverlay(): void;
  removeOverlayContainer(): void;
}

export function createHighlighterRuntimeState(): HighlighterRuntimeState {
  return {
    isModeEnabled: false,
    isPaused: false,
    isFrameEditing: false,
    isTooltipVisible: false,
    cleanupEventListeners: null,
    callbacks: {
      addFrame: null,
      removeFrame: null,
      clearFrames: null,
      hasFrameForElement: null,
    },
  };
}

export function createHighlighterCallbacks(state: HighlighterRuntimeState) {
  return () => ({
    addFrame: state.callbacks.addFrame,
    hasFrameForElement: state.callbacks.hasFrameForElement,
  });
}

export function createHighlighterStateGetters(state: HighlighterRuntimeState) {
  return {
    isModeEnabled: () => state.isModeEnabled,
    isPaused: () => state.isPaused,
    isFrameEditing: () => state.isFrameEditing,
    isTooltipVisible: () => state.isTooltipVisible,
  };
}

export function registerHighlighterFrameCallbacks(
  state: HighlighterRuntimeState,
  callbacks: {
    addFrame: (element: HTMLElement) => void;
    removeFrame: (frameId: string) => void;
    clearFrames: () => void;
    hasFrameForElement?: (element: HTMLElement) => boolean;
  }
): void {
  state.callbacks.addFrame = callbacks.addFrame;
  state.callbacks.removeFrame = callbacks.removeFrame;
  state.callbacks.clearFrames = callbacks.clearFrames;
  state.callbacks.hasFrameForElement = callbacks.hasFrameForElement || null;
}

export function addHighlighterFrame(state: HighlighterRuntimeState, element: HTMLElement): boolean {
  if (!state.callbacks.addFrame) {
    return false;
  }

  state.callbacks.addFrame(element);
  return true;
}

export function removeHighlighterFrame(state: HighlighterRuntimeState, id: string): boolean {
  if (!state.callbacks.removeFrame) {
    return false;
  }

  state.callbacks.removeFrame(id);
  return true;
}

export function clearHighlighterFrames(state: HighlighterRuntimeState): boolean {
  if (!state.callbacks.clearFrames) {
    return false;
  }

  state.callbacks.clearFrames();
  return true;
}

export function resetHighlighterHoverUi(controller: HighlighterHoverUiController): void {
  controller.cancelPendingHoverFrame();
  controller.clearHoverTracking();
  controller.removeHoverOverlay();
  controller.removeOverlayContainer();
}

export function setHighlighterTooltipVisibility(
  state: HighlighterRuntimeState,
  isVisible: boolean,
  controller: Pick<HighlighterHoverUiController, 'clearHoverTracking' | 'hideHoverOverlay'>
): void {
  state.isTooltipVisible = isVisible;

  if (isVisible) {
    controller.hideHoverOverlay();
    return;
  }

  controller.clearHoverTracking();
}
