import { beforeEach, expect, it, vi } from 'vitest';

const {
  appendForcedDetachEvent,
  appendNavigationEvent,
  createContentScriptDiagnosticEvent,
  diagnosticsLogger,
  getActiveRecordingIdForTab,
  getDiagnosticsSession,
  getDiagnosticsSessionByTabId,
  maybeFlushDiagnosticsSession,
  processDebuggerEvent,
} = vi.hoisted(() => ({
  appendForcedDetachEvent: vi.fn(),
  appendNavigationEvent: vi.fn(),
  createContentScriptDiagnosticEvent: vi.fn(),
  diagnosticsLogger: {
    warn: vi.fn(),
  },
  getActiveRecordingIdForTab: vi.fn(),
  getDiagnosticsSession: vi.fn(),
  getDiagnosticsSessionByTabId: vi.fn(),
  maybeFlushDiagnosticsSession: vi.fn(),
  processDebuggerEvent: vi.fn(),
}));

vi.mock('./cdp', () => ({
  appendForcedDetachEvent,
  appendNavigationEvent,
  processDebuggerEvent,
}));

vi.mock('./logger', () => ({
  diagnosticsLogger,
}));

vi.mock('./state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./state')>()),
  getActiveRecordingId: getActiveRecordingIdForTab,
  getDiagnosticsSession,
  getDiagnosticsSessionByTabId,
  maybeFlushDiagnosticsSession,
}));

vi.mock('./helpers', () => ({
  createContentScriptDiagnosticEvent,
}));

import {
  getActiveRecordingId,
  handleDebuggerEvent,
  handleEventFromContentScript,
  handleForcedDetach,
  handleTabNavigation,
} from './handlers';
import { reserveDiagnosticsErasureExclusion } from './lifecycle-gate';

function createSession() {
  return {
    recordingId: 'recording-1',
    tabId: 7,
    startedAt: 100,
    meta: {
      url: 'https://example.com',
      userAgent: 'Sniptale Test UA',
      viewportWidth: 1280,
      viewportHeight: 720,
      recordingStartedAt: '2026-03-21T12:00:00.000Z',
    },
    events: [] as Array<unknown>,
    pendingNetworkRequests: new Map(),
    isPaused: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('performance', { now: vi.fn(() => 250) });
});

it('ignores content-script events without an active diagnostics session', () => {
  getActiveRecordingIdForTab.mockReturnValue(undefined);

  handleEventFromContentScript({ kind: 'error', message: 'boom' }, 7);

  expect(diagnosticsLogger.warn).toHaveBeenCalledWith(
    'Ignoring content diagnostic event without active session',
    { senderTabId: 7 }
  );
  expect(createContentScriptDiagnosticEvent).not.toHaveBeenCalled();
});

it('appends content-script events and triggers flushing for active sessions', () => {
  const session = createSession();
  const event = {
    id: 'event-1',
    recordingId: 'recording-1',
    tsMs: 150,
    kind: 'error',
    message: 'boom',
  };
  getActiveRecordingIdForTab.mockReturnValue('recording-1');
  getDiagnosticsSession.mockReturnValue(session);
  createContentScriptDiagnosticEvent.mockReturnValue(event);

  handleEventFromContentScript({ kind: 'error', message: 'boom' }, 7);

  expect(createContentScriptDiagnosticEvent).toHaveBeenCalledWith({
    message: { kind: 'error', message: 'boom' },
    nowMs: 250,
    recordingId: 'recording-1',
    startedAt: 100,
  });
  expect(session.events).toContain(event);
  expect(maybeFlushDiagnosticsSession).toHaveBeenCalledWith(session);

  session.isPaused = true;
  handleEventFromContentScript({ kind: 'error', message: 'later' }, 7);
  expect(createContentScriptDiagnosticEvent).toHaveBeenCalledTimes(1);
});

it('delegates debugger events and tab/session fan-out to owning helpers', () => {
  const session = createSession();
  getDiagnosticsSessionByTabId.mockReturnValue(session);

  handleDebuggerEvent({ tabId: 7 }, 'Network.requestWillBeSent', { requestId: '1' });
  expect(processDebuggerEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      source: { tabId: 7 },
      method: 'Network.requestWillBeSent',
      params: { requestId: '1' },
      resolveRecordingId: getActiveRecordingIdForTab,
      getSession: getDiagnosticsSession,
      maybeFlush: maybeFlushDiagnosticsSession,
    })
  );

  handleTabNavigation(7, 'https://next.example');
  expect(appendNavigationEvent).toHaveBeenCalledWith(session, 'https://next.example');

  handleForcedDetach(7);
  expect(appendForcedDetachEvent).toHaveBeenCalledWith(session);
  expect(getActiveRecordingId(7)).toBe('recording-1');
  expect(getActiveRecordingIdForTab).toHaveBeenCalledWith(7);
});

it('rejects late diagnostics events and navigation while erasure is reserved', () => {
  const exclusion = reserveDiagnosticsErasureExclusion();
  try {
    handleEventFromContentScript({ kind: 'error', message: 'late' }, 7);
    handleDebuggerEvent({ tabId: 7 }, 'Network.requestWillBeSent', { requestId: 'late' });
    handleTabNavigation(7, 'https://late.example');
    handleForcedDetach(7);
  } finally {
    exclusion.release();
  }

  expect(createContentScriptDiagnosticEvent).not.toHaveBeenCalled();
  expect(processDebuggerEvent).not.toHaveBeenCalled();
  expect(appendNavigationEvent).not.toHaveBeenCalled();
  expect(appendForcedDetachEvent).not.toHaveBeenCalled();
});
