import {
  sanitizeDiagnosticData,
  sanitizeDiagnosticMessage,
  sanitizeDiagnosticUrl,
  stringifyDiagnosticValue,
} from '@sniptale/platform/observability/diagnostics/sanitizer';

import { pushEntry } from './state';
import type { ConsoleDiagnosticsState } from './types';

function createWindowErrorHandler(props: {
  getNow: () => string;
  maxEntries: number;
  state: ConsoleDiagnosticsState;
}) {
  return (event: ErrorEvent) => {
    const target = event.target;
    const targetUrl = (() => {
      if (target instanceof HTMLScriptElement || target instanceof HTMLImageElement) {
        return sanitizeDiagnosticUrl(target.src);
      }

      if (target instanceof HTMLLinkElement) {
        return sanitizeDiagnosticUrl(target.href);
      }

      return undefined;
    })();
    const messageParts = [
      event.message || 'Unhandled window error',
      targetUrl ? `resource=${targetUrl}` : '',
    ].filter((part) => part.length > 0);

    pushEntry(props.state, props.maxEntries, {
      kind: 'error',
      level: 'error',
      message: sanitizeDiagnosticMessage(messageParts.join(' ')),
      timestamp: props.getNow(),
      data: sanitizeDiagnosticData({
        colno: event.colno,
        filename: sanitizeDiagnosticUrl(event.filename),
        lineno: event.lineno,
        stack: event.error instanceof Error ? event.error.stack : undefined,
      }),
    });
  };
}

function createUnhandledRejectionHandler(props: {
  getNow: () => string;
  maxEntries: number;
  state: ConsoleDiagnosticsState;
}) {
  return (event: PromiseRejectionEvent) => {
    pushEntry(props.state, props.maxEntries, {
      kind: 'unhandledrejection',
      level: 'error',
      message: sanitizeDiagnosticMessage(
        `Unhandled promise rejection: ${stringifyDiagnosticValue(event.reason)}`
      ),
      timestamp: props.getNow(),
      data: sanitizeDiagnosticData(event.reason),
    });
  };
}

export function installWindowErrorCapture(props: {
  getNow: () => string;
  maxEntries: number;
  state: ConsoleDiagnosticsState;
  windowTarget: Window | null;
}): void {
  if (!props.windowTarget) {
    return;
  }

  const handleWindowError = createWindowErrorHandler(props);
  const handleUnhandledRejection = createUnhandledRejectionHandler(props);

  props.windowTarget.addEventListener('error', handleWindowError, true);
  props.windowTarget.addEventListener('unhandledrejection', handleUnhandledRejection, true);
  props.state.windowHandlers = {
    handleUnhandledRejection,
    handleWindowError,
  };
}

export function removeWindowErrorCapture(
  state: ConsoleDiagnosticsState,
  windowTarget: Window | null
): void {
  if (!state.windowHandlers || !windowTarget) {
    return;
  }

  windowTarget.removeEventListener('error', state.windowHandlers.handleWindowError, true);
  windowTarget.removeEventListener(
    'unhandledrejection',
    state.windowHandlers.handleUnhandledRejection,
    true
  );
  state.windowHandlers = null;
}
