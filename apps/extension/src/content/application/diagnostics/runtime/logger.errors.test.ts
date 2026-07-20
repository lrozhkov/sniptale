// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { createDiagnosticErrorHandlers } from './logger.errors';

function createState(isEnabled: boolean) {
  return {
    isEnabled,
    lastScrollY: 0,
    scrollTimeoutId: null,
    sessionRecordingId: null,
    sessionStartTime: 0,
  };
}

function registerWindowErrorTests(): void {
  it('emits sanitized window-error data only when enabled', () => {
    const sendEvent = vi.fn();
    const state = createState(true);
    const handlers = createDiagnosticErrorHandlers({ sendEvent, state });
    const error = new Error('boom');

    handlers.handleWindowError(
      new ErrorEvent('error', {
        message: 'Failure',
        filename: 'https://example.test/app.js',
        lineno: 12,
        colno: 3,
        error,
      })
    );

    expect(sendEvent).toHaveBeenCalledWith({
      kind: 'error',
      level: 'error',
      message: 'Failure',
      data: {
        filename: 'https://example.test/app.js',
        lineno: 12,
        colno: 3,
        stack: error.stack?.slice(0, 500),
      },
    });

    sendEvent.mockReset();
    state.isEnabled = false;
    handlers.handleWindowError(new ErrorEvent('error', { message: 'ignored' }));
    expect(sendEvent).not.toHaveBeenCalled();
  });
}

function registerUnhandledRejectionTests(): void {
  it('normalizes unhandled rejection reasons to message plus stack', () => {
    const sendEvent = vi.fn();
    const state = createState(true);
    const handlers = createDiagnosticErrorHandlers({ sendEvent, state });
    const reason = new Error('Rejected');

    handlers.handleUnhandledRejection({ reason } as PromiseRejectionEvent);

    expect(sendEvent).toHaveBeenCalledWith({
      kind: 'error',
      level: 'error',
      message: 'Rejected',
      data: {
        stack: reason.stack?.slice(0, 500),
      },
    });
  });
}

describe('createDiagnosticErrorHandlers', () => {
  registerWindowErrorTests();
  registerUnhandledRejectionTests();
});
