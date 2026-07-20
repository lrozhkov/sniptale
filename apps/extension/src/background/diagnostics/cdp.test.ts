import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActiveDiagnosticsSession } from '@sniptale/platform/observability/diagnostics/types';
import { processDebuggerEvent } from './cdp';

const handleForcefulDetach = vi.hoisted(() => vi.fn());
const getTabIdByTargetId = vi.hoisted(() => vi.fn());

vi.mock('../debugger/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../debugger/session')>()),
  handleForcefulDetach,
  getTabIdByTargetId,
}));

function createSession(): ActiveDiagnosticsSession {
  return {
    recordingId: 'rec-1',
    tabId: 7,
    startedAt: performance.now() - 10,
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

function resetMocks() {
  vi.clearAllMocks();
  getTabIdByTargetId.mockReturnValue(undefined);
}

function expectInvalidNetworkPayloadStopsAtBoundary() {
  const session = createSession();
  const maybeFlush = vi.fn();

  processDebuggerEvent({
    source: { tabId: 7 },
    method: 'Network.requestWillBeSent',
    params: {
      requestId: 42,
    },
    resolveRecordingId: () => 'rec-1',
    getSession: () => session,
    maybeFlush,
  });

  expect(session.pendingNetworkRequests.size).toBe(0);
  expect(session.events).toHaveLength(0);
  expect(maybeFlush).not.toHaveBeenCalled();
}

function expectConsolePayloadGetsRecorded() {
  const session = createSession();
  const maybeFlush = vi.fn();

  processDebuggerEvent({
    source: { tabId: 7 },
    method: 'Runtime.consoleAPICalled',
    params: {
      type: 'log',
      args: [{ value: 'hello' }],
      executionContextId: 1,
      timestamp: 1,
    },
    resolveRecordingId: () => 'rec-1',
    getSession: () => session,
    maybeFlush,
  });

  expect(session.events).toHaveLength(1);
  expect(session.events[0]).toMatchObject({
    kind: 'console',
    level: 'log',
    message: 'hello',
  });
  expect(maybeFlush).toHaveBeenCalledWith(session);
}

function expectSanitizedConsoleEvent(session: ActiveDiagnosticsSession) {
  expect(session.events[0]).toMatchObject({
    kind: 'console',
    message: expect.stringContaining('***'),
    data: {
      argCount: 1,
      stackTrace: [
        {
          functionName: 'submitForm',
          lineNumber: 4,
          url: 'https://example.test/path',
        },
      ],
    },
  });
  const [event] = session.events;
  if (!event) {
    throw new Error('Expected a diagnostics event to be recorded');
  }
  expect(event.data).not.toHaveProperty('args');
}

function expectConsolePayloadGetsSanitized() {
  const session = createSession();

  processDebuggerEvent({
    source: { tabId: 7 },
    method: 'Runtime.consoleAPICalled',
    params: createSanitizedConsoleParams(),
    resolveRecordingId: () => 'rec-1',
    getSession: () => session,
    maybeFlush: vi.fn(),
  });

  expectSanitizedConsoleEvent(session);
}

function createSanitizedConsoleParams() {
  return {
    type: 'log',
    args: [{ value: { apiKey: 'secret-key', text: 'sensitive text' } }],
    executionContextId: 1,
    stackTrace: {
      callFrames: [
        {
          functionName: 'submitForm',
          lineNumber: 4,
          url: 'https://example.test/path?token=123#hash',
        },
      ],
    },
    timestamp: 1,
  };
}

describe('processDebuggerEvent', () => {
  beforeEach(resetMocks);

  it(
    'ignores invalid network payloads at the boundary',
    expectInvalidNetworkPayloadStopsAtBoundary
  );

  it('records valid console payloads and flushes the session', expectConsolePayloadGetsRecorded);

  it(
    'redacts raw console payload details before persisting diagnostics',
    expectConsolePayloadGetsSanitized
  );
});
