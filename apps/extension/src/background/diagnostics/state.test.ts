import { afterEach, expect, it, vi } from 'vitest';
import type { ActiveDiagnosticsSession } from '@sniptale/platform/observability/diagnostics/types';

const { diagnosticsDebugMock, saveActiveDiagnosticsSessionsToStorageMock } = vi.hoisted(() => ({
  diagnosticsDebugMock: vi.fn(),
  saveActiveDiagnosticsSessionsToStorageMock: vi.fn(),
}));

vi.mock('./logger', () => ({
  diagnosticsLogger: {
    debug: diagnosticsDebugMock,
    error: vi.fn(),
  },
}));

vi.mock('../storage/diagnostics/active-sessions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../storage/diagnostics/active-sessions')>()),
  saveActiveDiagnosticsSessionsToStorage: saveActiveDiagnosticsSessionsToStorageMock,
}));

import {
  getActiveRecordingId,
  getDiagnosticsSession,
  getDiagnosticsSessionByTabId,
  hasActiveDiagnosticsSession,
  hasActiveDiagnosticsSessions,
  maybeFlushDiagnosticsSession,
  registerDiagnosticsSession,
  resetDiagnosticsStateForLocalDataErasure,
  startDiagnosticsFlushLoop,
  stopDiagnosticsFlushLoop,
  unregisterDiagnosticsSession,
} from './state';

function createSession(
  overrides: Partial<ActiveDiagnosticsSession> = {}
): ActiveDiagnosticsSession {
  return {
    events: [],
    isPaused: false,
    meta: {
      recordingStartedAt: '2026-03-21T12:00:00.000Z',
      url: 'https://example.test',
      userAgent: 'Sniptale Test UA',
      viewportHeight: 720,
      viewportWidth: 1280,
    },
    pendingNetworkRequests: new Map(),
    recordingId: 'recording-1',
    startedAt: 100,
    tabId: 7,
    ...overrides,
  };
}

function createDeferredFlush() {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

afterEach(async () => {
  await resetDiagnosticsStateForLocalDataErasure();
  vi.useRealTimers();
  vi.clearAllMocks();
});

it('tracks and unregisters active diagnostics sessions by recording and tab', () => {
  const session = createSession();

  expect(hasActiveDiagnosticsSession('recording-1')).toBe(false);

  registerDiagnosticsSession(session);

  expect(hasActiveDiagnosticsSessions()).toBe(true);
  expect(hasActiveDiagnosticsSession('recording-1')).toBe(true);
  expect(getDiagnosticsSession('recording-1')).toBe(session);
  expect(getDiagnosticsSessionByTabId(7)).toBe(session);
  expect(getActiveRecordingId(7)).toBe('recording-1');
  expect(getDiagnosticsSessionByTabId(8)).toBeUndefined();

  unregisterDiagnosticsSession('recording-1', 7);

  expect(hasActiveDiagnosticsSessions()).toBe(false);
  expect(getDiagnosticsSessionByTabId(7)).toBeUndefined();
});

it('flushes active sessions from caps and timer loops', async () => {
  vi.useFakeTimers();
  saveActiveDiagnosticsSessionsToStorageMock.mockResolvedValue(undefined);
  const session = createSession({
    events: Array.from({ length: 500 }, (_, index) => ({
      id: `event-${index}`,
      kind: 'console',
      message: 'log',
      recordingId: 'recording-1',
      tsMs: index,
    })),
  });
  registerDiagnosticsSession(session);

  maybeFlushDiagnosticsSession(session);
  await vi.waitFor(() => expect(saveActiveDiagnosticsSessionsToStorageMock).toHaveBeenCalled());

  saveActiveDiagnosticsSessionsToStorageMock.mockClear();
  startDiagnosticsFlushLoop();
  startDiagnosticsFlushLoop();
  await vi.advanceTimersByTimeAsync(3000);

  expect(saveActiveDiagnosticsSessionsToStorageMock).toHaveBeenCalledOnce();
  expect(diagnosticsDebugMock).toHaveBeenCalledWith('Started diagnostics flush interval');

  stopDiagnosticsFlushLoop();
  stopDiagnosticsFlushLoop();
  expect(diagnosticsDebugMock).toHaveBeenCalledWith('Stopped diagnostics flush interval');
});

it('replays a requested diagnostics flush after the in-flight flush settles', async () => {
  const firstFlush = createDeferredFlush();
  saveActiveDiagnosticsSessionsToStorageMock.mockReturnValueOnce(firstFlush.promise);
  const session = createSession({
    events: Array.from({ length: 500 }, (_, index) => ({
      id: `event-${index}`,
      kind: 'console',
      message: 'log',
      recordingId: 'recording-1',
      tsMs: index,
    })),
  });
  registerDiagnosticsSession(session);

  maybeFlushDiagnosticsSession(session);
  maybeFlushDiagnosticsSession(session);

  expect(saveActiveDiagnosticsSessionsToStorageMock).toHaveBeenCalledOnce();
  saveActiveDiagnosticsSessionsToStorageMock.mockResolvedValue(undefined);
  firstFlush.resolve();

  await vi.waitFor(() =>
    expect(saveActiveDiagnosticsSessionsToStorageMock).toHaveBeenCalledTimes(2)
  );
});

it('clears active diagnostics sessions and tab ownership for local data erasure', async () => {
  vi.useFakeTimers();
  registerDiagnosticsSession(createSession());
  startDiagnosticsFlushLoop();

  await resetDiagnosticsStateForLocalDataErasure();

  expect(hasActiveDiagnosticsSessions()).toBe(false);
  expect(getDiagnosticsSession('recording-1')).toBeUndefined();
  expect(getActiveRecordingId(7)).toBeUndefined();
});

it('drains an in-flight durable flush before local data erasure completes', async () => {
  const flush = createDeferredFlush();
  saveActiveDiagnosticsSessionsToStorageMock.mockReturnValueOnce(flush.promise);
  const session = createSession({
    events: Array.from({ length: 500 }, (_, index) => ({
      id: `event-${index}`,
      kind: 'console',
      message: 'log',
      recordingId: 'recording-1',
      tsMs: index,
    })),
  });
  registerDiagnosticsSession(session);
  maybeFlushDiagnosticsSession(session);
  await vi.waitFor(() => expect(saveActiveDiagnosticsSessionsToStorageMock).toHaveBeenCalledOnce());

  let resetSettled = false;
  const reset = resetDiagnosticsStateForLocalDataErasure().then(() => {
    resetSettled = true;
  });
  await Promise.resolve();

  expect(hasActiveDiagnosticsSessions()).toBe(false);
  expect(resetSettled).toBe(false);

  flush.resolve();
  await reset;
  expect(saveActiveDiagnosticsSessionsToStorageMock).toHaveBeenCalledOnce();
});
