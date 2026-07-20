const SCROLL_STABILIZATION_FRAME_PASSES = 20;
const SCROLL_DEFERRED_LAYOUT_DELAYS_MS = [250, 750, 1500] as const;

type ScrollDebounceState = {
  animationFrameId: number | null;
  settledAnimationFrameId: number | null;
  deferredLayoutTimeoutIds: number[];
};

function clearAnimationFrameId(id: number | null) {
  if (id !== null) {
    cancelAnimationFrame(id);
  }
}

function scheduleDeferredLayoutPasses(
  handleScroll: () => void,
  onTimeoutSettled: (timeoutId: number) => void
) {
  return SCROLL_DEFERRED_LAYOUT_DELAYS_MS.map((delayMs) => {
    const timeoutId = window.setTimeout(() => {
      onTimeoutSettled(timeoutId);
      handleScroll();
    }, delayMs);
    return timeoutId;
  });
}

function clearPendingFrames(state: ScrollDebounceState): void {
  clearAnimationFrameId(state.animationFrameId);
  clearAnimationFrameId(state.settledAnimationFrameId);
  state.deferredLayoutTimeoutIds.forEach((id) => window.clearTimeout(id));
  state.deferredLayoutTimeoutIds = [];
  state.animationFrameId = null;
  state.settledAnimationFrameId = null;
}

function scheduleSettledPass(
  state: ScrollDebounceState,
  handleScroll: () => void,
  remainingPasses: number
): void {
  if (remainingPasses <= 0) {
    return;
  }

  state.settledAnimationFrameId = window.requestAnimationFrame(() => {
    state.settledAnimationFrameId = null;
    handleScroll();
    scheduleSettledPass(state, handleScroll, remainingPasses - 1);
  });
}

function removeDeferredLayoutTimeout(state: ScrollDebounceState, timeoutId: number): void {
  state.deferredLayoutTimeoutIds = state.deferredLayoutTimeoutIds.filter((id) => id !== timeoutId);
}

export function createDebouncedScrollHandler(handleScroll: () => void) {
  const state: ScrollDebounceState = {
    animationFrameId: null,
    settledAnimationFrameId: null,
    deferredLayoutTimeoutIds: [],
  };
  return {
    debouncedHandleScroll: () => {
      clearPendingFrames(state);
      state.animationFrameId = window.requestAnimationFrame(() => {
        state.animationFrameId = null;
        handleScroll();
        scheduleSettledPass(state, handleScroll, SCROLL_STABILIZATION_FRAME_PASSES);
        state.deferredLayoutTimeoutIds = scheduleDeferredLayoutPasses(handleScroll, (timeoutId) => {
          removeDeferredLayoutTimeout(state, timeoutId);
        });
      });
    },
    clearDebounce: () => {
      clearPendingFrames(state);
    },
  };
}
