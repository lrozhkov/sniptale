// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import {
  createDiagnosticEventSender,
  createDiagnosticLoggerState,
  disableDiagnosticLogger,
  enableDiagnosticLogger,
} from './logger.lifecycle';

const mocks = vi.hoisted(() => ({
  sendDiagnosticContentEvent: vi.fn(),
}));

vi.mock('./logger.helpers', async () => {
  const actual = await vi.importActual<typeof import('./logger.helpers')>('./logger.helpers');

  return {
    ...actual,
    sendDiagnosticContentEvent: mocks.sendDiagnosticContentEvent,
  };
});

function createActionHandlers() {
  return {
    handleKeyAction: vi.fn(),
    handleScrollAction: vi.fn(),
    handleUserAction: vi.fn(),
  };
}

function createErrorHandlers() {
  return {
    handleUnhandledRejection: vi.fn(),
    handleWindowError: vi.fn(),
  };
}

describe('diagnostic logger lifecycle', () => {
  it('sends events with current session metadata', () => {
    const state = createDiagnosticLoggerState();
    state.isEnabled = true;
    state.sessionRecordingId = 'rec-1';
    state.sessionStartTime = 25;

    createDiagnosticEventSender(state)({
      kind: 'action',
      level: 'log',
      message: 'click',
    });

    expect(mocks.sendDiagnosticContentEvent).toHaveBeenCalledWith({
      event: {
        kind: 'action',
        level: 'log',
        message: 'click',
      },
      sessionRecordingId: 'rec-1',
      sessionStartTime: 25,
      isEnabled: true,
    });
  });

  it('enables listeners, stores recording metadata, and clears pending scroll throttles on disable', () => {
    vi.useFakeTimers();
    const state = createDiagnosticLoggerState();
    const actionHandlers = createActionHandlers();
    const errorHandlers = createErrorHandlers();

    enableDiagnosticLogger({
      actionHandlers,
      errorHandlers,
      recordingId: 'rec-2',
      state,
    });

    expect(state.isEnabled).toBe(true);
    expect(state.sessionRecordingId).toBe('rec-2');

    state.scrollTimeoutId = window.setTimeout(() => undefined, 500);
    disableDiagnosticLogger({ actionHandlers, errorHandlers, state });

    expect(state.isEnabled).toBe(false);
    expect(state.sessionRecordingId).toBeNull();
    expect(state.scrollTimeoutId).toBeNull();
    vi.useRealTimers();
  });
});
