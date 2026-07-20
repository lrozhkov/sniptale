import { beforeEach, expect, it, vi } from 'vitest';

const {
  clearDiagnosticsSessionFromStorage,
  diagnosticsLogger,
  hasActiveDiagnosticsSessions,
  saveDiagnostics,
  stopDiagnosticsFlushLoop,
  unregisterDiagnosticsSession,
} = vi.hoisted(() => ({
  clearDiagnosticsSessionFromStorage: vi.fn(),
  diagnosticsLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
  },
  hasActiveDiagnosticsSessions: vi.fn(),
  saveDiagnostics: vi.fn(),
  stopDiagnosticsFlushLoop: vi.fn(),
  unregisterDiagnosticsSession: vi.fn(),
}));

vi.mock('../../composition/persistence/diagnostics/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/diagnostics/index')>()),
  saveDiagnostics,
}));

vi.mock('./state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./state')>()),
  hasActiveDiagnosticsSessions,
  stopDiagnosticsFlushLoop,
  unregisterDiagnosticsSession,
}));

vi.mock('./logger', () => ({
  diagnosticsLogger,
}));

vi.mock('../storage/diagnostics/active-sessions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../storage/diagnostics/active-sessions')>()),
  clearDiagnosticsSessionFromStorage,
}));

import {
  buildDiagnosticMeta,
  cleanupDiagnosticsSession,
  createDiagnosticsSession,
  finalizeSessionMeta,
  persistDiagnosticsSession,
} from './session';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('navigator', { userAgent: 'Sniptale Test UA' });
  vi.stubGlobal('performance', { now: vi.fn(() => 5_000) });
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'event-1') });
  saveDiagnostics.mockResolvedValue(undefined);
  clearDiagnosticsSessionFromStorage.mockResolvedValue(undefined);
  hasActiveDiagnosticsSessions.mockReturnValue(false);
});

function createSensitiveDiagnosticsSession() {
  const session = createDiagnosticsSession('recording-2', 8, {
    url: 'https://example.com/app?token=123',
    userAgent: 'Sniptale Test UA token=123',
    viewportWidth: 1280,
    viewportHeight: 720,
    recordingStartedAt: '2026-03-21T12:00:00.000Z',
  });
  session.events.push({
    id: 'event-2',
    recordingId: 'recording-2',
    tsMs: 15,
    kind: 'network',
    level: 'error',
    message: 'GET https://example.com/app?token=123',
    data: {
      requestId: 'request-1',
      url: 'https://example.com/app?token=123',
      method: 'GET',
      requestTime: 15,
      statusText: 'Failed token=123',
      error: 'Bearer abcdefgh',
    },
  });

  return session;
}

function expectSanitizedDiagnosticsSaved() {
  expect(saveDiagnostics).toHaveBeenCalledWith(
    expect.objectContaining({
      recordingId: 'recording-2',
      schemaVersion: 1,
      meta: expect.objectContaining({
        url: 'https://example.com/app',
        userAgent: 'Sniptale Test UA token=***',
      }),
    }),
    [
      expect.objectContaining({
        message: 'GET https://example.com/app?token=***',
        data: expect.objectContaining({
          url: 'https://example.com/app',
          statusText: 'Failed token=***',
          error: 'Bearer ***',
        }),
      }),
    ]
  );
}

it('builds diagnostic metadata with a sanitized URL and viewport details', () => {
  const meta = buildDiagnosticMeta('https://example.com?a=1', {
    width: 1440,
    height: 900,
  });

  expect(meta).toEqual({
    url: 'https://example.com/',
    userAgent: 'Sniptale Test UA',
    viewportWidth: 1440,
    viewportHeight: 900,
    recordingStartedAt: expect.any(String),
  });
});

it('creates and finalizes a diagnostics session with a meta event', () => {
  const session = createDiagnosticsSession('recording-1', 7, {
    url: 'https://example.com',
    userAgent: 'Sniptale Test UA',
    viewportWidth: 1280,
    viewportHeight: 720,
    recordingStartedAt: '2026-03-21T12:00:00.000Z',
  });

  expect(session).toMatchObject({
    recordingId: 'recording-1',
    tabId: 7,
    events: [],
    isPaused: false,
  });
  expect(session.pendingNetworkRequests.size).toBe(0);

  finalizeSessionMeta(session);

  expect(session.meta.recordingEndedAt).toEqual(expect.any(String));
  expect(session.events).toContainEqual({
    id: 'event-1',
    recordingId: 'recording-1',
    tsMs: 0,
    kind: 'meta',
    message: 'Recording ended',
    data: { duration: 0 },
  });
});

it('persists a diagnostics session and logs success or failure', async () => {
  const session = createSensitiveDiagnosticsSession();

  await expect(persistDiagnosticsSession(session, 'recording-2')).resolves.toBe(true);
  expectSanitizedDiagnosticsSaved();
  expect(diagnosticsLogger.log).toHaveBeenCalledWith('Saved diagnostics session', {
    eventCount: 1,
    recordingId: 'recording-2',
  });

  const idbError = new Error('idb failed');
  saveDiagnostics.mockRejectedValueOnce(idbError);

  await expect(persistDiagnosticsSession(session, 'recording-2')).resolves.toBe(false);
  expect(diagnosticsLogger.error).toHaveBeenCalledWith(
    'Failed to persist diagnostics session to IndexedDB',
    idbError
  );
});

it('cleans up session state and stops the flush loop only when no sessions remain', async () => {
  const session = createDiagnosticsSession('recording-3', 9, {
    url: 'https://example.com',
    userAgent: 'Sniptale Test UA',
    viewportWidth: 1280,
    viewportHeight: 720,
    recordingStartedAt: '2026-03-21T12:00:00.000Z',
  });

  await cleanupDiagnosticsSession('recording-3', session);
  expect(unregisterDiagnosticsSession).toHaveBeenCalledWith('recording-3', 9);
  expect(clearDiagnosticsSessionFromStorage).toHaveBeenCalledWith('recording-3');
  expect(stopDiagnosticsFlushLoop).toHaveBeenCalledOnce();

  hasActiveDiagnosticsSessions.mockReturnValue(true);
  await cleanupDiagnosticsSession('recording-3', session);
  expect(stopDiagnosticsFlushLoop).toHaveBeenCalledTimes(1);
});
