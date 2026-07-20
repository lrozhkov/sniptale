import type { HighlighterRuntimeState } from './state';

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
