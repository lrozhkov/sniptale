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
