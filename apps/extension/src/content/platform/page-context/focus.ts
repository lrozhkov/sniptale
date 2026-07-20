const DEFAULT_FOCUS_SETTLE_MS = 80;
const DEFAULT_FOCUS_TIMEOUT_MS = 3000;
const FOCUS_POLL_INTERVAL_MS = 50;

type FocusWaitState = {
  handleReady: () => void;
  pollId: number | null;
  resolve: (focused: boolean) => void;
  resolved: boolean;
  settleMs: number;
  settleTimeoutId: number | null;
  timeoutId: number | null;
};

export function isContentDocumentFocused(): boolean {
  return document.visibilityState === 'visible' && document.hasFocus();
}

function cleanupFocusWait(state: FocusWaitState): void {
  if (state.timeoutId !== null) {
    window.clearTimeout(state.timeoutId);
  }
  if (state.pollId !== null) {
    window.clearInterval(state.pollId);
  }
  if (state.settleTimeoutId !== null) {
    window.clearTimeout(state.settleTimeoutId);
  }
  window.removeEventListener('focus', state.handleReady);
  window.removeEventListener('pageshow', state.handleReady);
  document.removeEventListener('visibilitychange', state.handleReady);
  document.removeEventListener('focusin', state.handleReady);
}

function finishFocusWait(state: FocusWaitState, focused: boolean): void {
  if (state.resolved) {
    return;
  }
  state.resolved = true;
  cleanupFocusWait(state);
  state.resolve(focused);
}

function resolveFocusedDocument(state: FocusWaitState): void {
  if (!isContentDocumentFocused()) {
    return;
  }
  if (state.settleMs <= 0) {
    finishFocusWait(state, true);
    return;
  }
  if (state.settleTimeoutId !== null) {
    return;
  }
  state.settleTimeoutId = window.setTimeout(() => {
    state.settleTimeoutId = null;
    if (isContentDocumentFocused()) {
      finishFocusWait(state, true);
    }
  }, state.settleMs);
}

function createFocusWaitState(
  resolve: (focused: boolean) => void,
  settleMs: number
): FocusWaitState {
  const state: FocusWaitState = {
    handleReady: () => undefined,
    pollId: null,
    resolve,
    resolved: false,
    settleMs,
    settleTimeoutId: null,
    timeoutId: null,
  };
  state.handleReady = () => resolveFocusedDocument(state);
  return state;
}

function attachFocusWait(state: FocusWaitState, timeoutMs: number): void {
  state.timeoutId = window.setTimeout(() => finishFocusWait(state, false), timeoutMs);
  state.pollId = window.setInterval(state.handleReady, FOCUS_POLL_INTERVAL_MS);
  window.addEventListener('focus', state.handleReady);
  window.addEventListener('pageshow', state.handleReady);
  document.addEventListener('visibilitychange', state.handleReady);
  document.addEventListener('focusin', state.handleReady);
  state.handleReady();
}

export function waitForContentDocumentFocus({
  settleMs = DEFAULT_FOCUS_SETTLE_MS,
  timeoutMs = DEFAULT_FOCUS_TIMEOUT_MS,
}: {
  settleMs?: number;
  timeoutMs?: number;
} = {}): Promise<boolean> {
  if (isContentDocumentFocused()) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    attachFocusWait(createFocusWaitState(resolve, settleMs), timeoutMs);
  });
}
