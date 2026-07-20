const POPUP_TRACE_FLAG_KEY = 'sniptale.popup.trace';

function isPopupTraceEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem(POPUP_TRACE_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Loads popup runtime tracing only when it is explicitly enabled in popup DevTools.
 */
export function initializePopupTracer(): void {
  if (!isPopupTraceEnabled()) {
    return;
  }

  void import('@sniptale/platform/observability/message-tracer').then(({ initTracer }) => {
    initTracer('popup');
  });
}
