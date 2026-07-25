type HighlighterFrameCallbacks = {
  addFrame: ((element: HTMLElement) => void) | null;
  addFreeFrame: import('../../../features/highlighter/contracts').AddFreeFrameCallback | null;
  removeFrame: ((frameId: string) => void) | null;
  clearFrames: (() => void) | null;
  hasFrameForElement: ((element: HTMLElement) => boolean) | null;
};

export type HighlighterRuntimeState = {
  isModeEnabled: boolean;
  isPaused: boolean;
  isFrameEditing: boolean;
  cleanupEventListeners: (() => void) | null;
  callbacks: HighlighterFrameCallbacks;
};

interface HighlighterHoverUiController {
  input: { cancelDrawing(reason?: 'teardown'): boolean };
  tracking: { cancelPendingFrame(): void; clear(): void };
  overlay: { hidePreview(): void; removePreview(): void; removeContainer(): void };
}

export function createHighlighterRuntimeState(): HighlighterRuntimeState {
  return {
    isModeEnabled: false,
    isPaused: false,
    isFrameEditing: false,
    cleanupEventListeners: null,
    callbacks: {
      addFrame: null,
      addFreeFrame: null,
      removeFrame: null,
      clearFrames: null,
      hasFrameForElement: null,
    },
  };
}

export function createHighlighterCallbacks(state: HighlighterRuntimeState) {
  return () => ({
    addFrame: state.callbacks.addFrame,
    addFreeFrame: state.callbacks.addFreeFrame,
    hasFrameForElement: state.callbacks.hasFrameForElement,
  });
}

export function createHighlighterStateGetters(state: HighlighterRuntimeState) {
  return {
    isModeEnabled: () => state.isModeEnabled,
    isPaused: () => state.isPaused,
    isFrameEditing: () => state.isFrameEditing,
  };
}

export function registerHighlighterFrameCallbacks(
  state: HighlighterRuntimeState,
  callbacks: {
    addFrame: (element: HTMLElement) => void;
    addFreeFrame: import('../../../features/highlighter/contracts').AddFreeFrameCallback;
    removeFrame: (frameId: string) => void;
    clearFrames: () => void;
    hasFrameForElement?: (element: HTMLElement) => boolean;
  }
): void {
  state.callbacks.addFrame = callbacks.addFrame;
  state.callbacks.addFreeFrame = callbacks.addFreeFrame;
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
  controller.input.cancelDrawing('teardown');
  controller.tracking.cancelPendingFrame();
  controller.tracking.clear();
  controller.overlay.removePreview();
  controller.overlay.removeContainer();
}
