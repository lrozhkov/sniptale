import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActiveDiagnosticsSession } from '@sniptale/platform/observability/diagnostics/types';

const getTabIdByTargetId = vi.hoisted(() => vi.fn());
const dispatchDebuggerEvent = vi.hoisted(() => vi.fn());
const diagnosticsLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../debugger/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../debugger/session')>()),
  getTabIdByTargetId,
}));

vi.mock('./cdp.dispatch', () => ({
  dispatchDebuggerEvent,
}));

vi.mock('./logger', () => ({
  diagnosticsLogger,
}));

import { processDebuggerEvent } from './cdp';

function createSession(): ActiveDiagnosticsSession {
  return {
    recordingId: 'rec-1',
    tabId: 7,
    startedAt: 100,
    meta: {
      url: 'https://example.test',
      userAgent: 'Vitest',
      viewportWidth: 1280,
      viewportHeight: 720,
      recordingStartedAt: new Date().toISOString(),
    },
    events: [],
    pendingNetworkRequests: new Map(),
    isPaused: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getTabIdByTargetId.mockReturnValue(undefined);
  vi.stubGlobal('performance', { now: vi.fn(() => 175) });
});

function expectTargetIdResolution() {
  const session = createSession();
  getTabIdByTargetId.mockReturnValue(42);

  processDebuggerEvent({
    source: { targetId: 'target-1' },
    method: 'Runtime.consoleAPICalled',
    params: { type: 'log' },
    resolveRecordingId: (tabId) => (tabId === 42 ? 'rec-1' : undefined),
    getSession: () => session,
    maybeFlush: vi.fn(),
  });

  expect(getTabIdByTargetId).toHaveBeenCalledWith('target-1');
  expect(dispatchDebuggerEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'Runtime.consoleAPICalled',
      session,
      tsMs: 75,
    })
  );
}

function expectMissingTabContextLogging() {
  processDebuggerEvent({
    source: { targetId: 'target-1' },
    method: 'Runtime.consoleAPICalled',
    params: {},
    resolveRecordingId: () => 'rec-1',
    getSession: () => createSession(),
    maybeFlush: vi.fn(),
  });

  processDebuggerEvent({
    source: {},
    method: 'Network.responseReceived',
    params: {},
    resolveRecordingId: () => 'rec-1',
    getSession: () => createSession(),
    maybeFlush: vi.fn(),
  });

  expect(diagnosticsLogger.debug).toHaveBeenNthCalledWith(
    1,
    'Ignoring debugger event without tab context',
    { hasTargetId: true, method: 'Runtime.consoleAPICalled' }
  );
  expect(diagnosticsLogger.debug).toHaveBeenNthCalledWith(
    2,
    'Ignoring debugger event without tab context',
    { hasTargetId: false, method: 'Network.responseReceived' }
  );
  expect(dispatchDebuggerEvent).not.toHaveBeenCalled();
}

function expectNoRecordingOrSessionShortCircuit() {
  processDebuggerEvent({
    source: { tabId: 7 },
    method: 'Runtime.consoleAPICalled',
    params: {},
    resolveRecordingId: () => undefined,
    getSession: () => createSession(),
    maybeFlush: vi.fn(),
  });

  processDebuggerEvent({
    source: { tabId: 7 },
    method: 'Runtime.consoleAPICalled',
    params: {},
    resolveRecordingId: () => 'rec-1',
    getSession: () => undefined,
    maybeFlush: vi.fn(),
  });

  expect(dispatchDebuggerEvent).not.toHaveBeenCalled();
}

function expectPausedSessionShortCircuit() {
  const session = createSession();
  session.isPaused = true;

  processDebuggerEvent({
    source: { tabId: 7 },
    method: 'Runtime.consoleAPICalled',
    params: {},
    resolveRecordingId: () => 'rec-1',
    getSession: () => session,
    maybeFlush: vi.fn(),
  });

  expect(dispatchDebuggerEvent).not.toHaveBeenCalled();
}

function expectDispatcherErrorLogging() {
  const session = createSession();
  const error = new Error('dispatch failed');
  dispatchDebuggerEvent.mockImplementation(() => {
    throw error;
  });

  processDebuggerEvent({
    source: { tabId: 7 },
    method: 'Runtime.consoleAPICalled',
    params: {},
    resolveRecordingId: () => 'rec-1',
    getSession: () => session,
    maybeFlush: vi.fn(),
  });

  expect(diagnosticsLogger.error).toHaveBeenCalledWith('Error handling debugger event', error);
}

describe('processDebuggerEvent lifecycle shell', () => {
  it('resolves tab context from target ids before dispatching', expectTargetIdResolution);
  it('logs ignored runtime and network events without tab context', expectMissingTabContextLogging);
  it(
    'stops before dispatch when there is no active recording or session',
    expectNoRecordingOrSessionShortCircuit
  );
  it(
    'stops before dispatch when the diagnostics session is paused',
    expectPausedSessionShortCircuit
  );
  it(
    'logs errors from the dispatcher without breaking the debugger listener',
    expectDispatcherErrorLogging
  );
});
