import { beforeEach, expect, it, vi } from 'vitest';
import type { SessionSnapshot } from '@sniptale/platform/observability/diagnostics/types';

const {
  clearDiagnosticsSessionFromStorage,
  clearStoredDiagnosticSnapshots,
  diagnosticsLogger,
  readStoredDiagnosticSnapshots,
  replaceStoredDiagnosticSnapshots,
  restoreStoredDiagnosticsSession,
  saveActiveDiagnosticsSessionsToStorage,
  saveDiagnostics,
} = vi.hoisted(() => ({
  clearDiagnosticsSessionFromStorage: vi.fn(),
  clearStoredDiagnosticSnapshots: vi.fn(),
  diagnosticsLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
  },
  readStoredDiagnosticSnapshots: vi.fn(),
  replaceStoredDiagnosticSnapshots: vi.fn(),
  restoreStoredDiagnosticsSession: vi.fn(),
  saveActiveDiagnosticsSessionsToStorage: vi.fn(),
  saveDiagnostics: vi.fn(),
}));

vi.mock('../../composition/persistence/diagnostics/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/diagnostics/index')>()),
  saveDiagnostics,
}));

vi.mock('./logger', () => ({
  diagnosticsLogger,
}));

vi.mock('../storage/diagnostics/active-sessions', () => ({
  clearDiagnosticsSessionFromStorage,
  clearStoredDiagnosticSnapshots,
  readStoredDiagnosticSnapshots,
  replaceStoredDiagnosticSnapshots,
  restoreStoredDiagnosticsSession,
  saveActiveDiagnosticsSessionsToStorage,
}));

import { reserveDiagnosticsErasureExclusion } from './lifecycle-gate';
import { recoverInterruptedSessions } from './recovery';

function createSnapshot(recordingId: string, eventCount: number): SessionSnapshot {
  return {
    recordingId,
    tabId: 7,
    startedAt: 1_000,
    meta: {
      interrupted: false,
      recordingStartedAt: '2026-03-21T12:00:00.000Z',
      url: 'https://example.com',
      userAgent: 'Mozilla/5.0',
      viewportHeight: 720,
      viewportWidth: 1280,
    },
    events: Array.from({ length: eventCount }, (_, index) => ({
      id: `${recordingId}-event-${index}`,
      kind: 'network',
      message: 'network event',
      recordingId,
      tsMs: index + 1,
    })),
    pendingNetworkRequests: [],
    isPaused: false,
  };
}

function createNetworkRecoverySnapshot(): SessionSnapshot {
  return {
    ...createSnapshot('recording-network', 0),
    meta: {
      interrupted: false,
      recordingStartedAt: '2026-03-21T12:00:00.000Z',
      url: 'https://example.com/start?token=secret#frag',
      userAgent: 'Browser with Authorization: Bearer secret',
      viewportHeight: 720,
      viewportWidth: 1280,
    },
    events: [
      {
        data: {
          method: 'GET',
          requestId: 'request-1',
          requestTime: 12,
          resourceType: 'XHR',
          status: 200,
          statusText: 'OK Authorization: Bearer secret',
          url: 'https://example.com/api?q=private-user-text#frag',
        },
        id: 'event-network',
        kind: 'network',
        message: 'Fetched with Authorization: Bearer secret',
        recordingId: 'recording-network',
        tsMs: 12,
      },
    ],
  };
}

function addSensitiveRecoveryExtras(snapshot: SessionSnapshot): void {
  const [event] = snapshot.events;
  if (event === undefined || typeof event.data !== 'object' || event.data === null) {
    throw new Error('Expected network recovery event fixture');
  }

  Object.assign(snapshot.meta, {
    authorization: 'Bearer secret',
    html: '<input value="secret">',
  });
  Object.assign(event, { rawResponse: 'token=secret' });
  Object.assign(event.data, {
    headers: { cookie: 'session=secret' },
    postData: 'private user text',
  });
}

function expectRecoveredSnapshotWasSanitized(): void {
  expect(saveDiagnostics).toHaveBeenCalledWith(
    expect.objectContaining({
      meta: expect.objectContaining({
        interrupted: true,
        url: 'https://example.com/start',
        userAgent: expect.not.stringContaining('secret'),
      }),
      recordingId: 'recording-network',
    }),
    [
      expect.objectContaining({
        data: expect.objectContaining({
          statusText: expect.not.stringContaining('secret'),
          url: 'https://example.com/api',
        }),
        message: expect.not.stringContaining('secret'),
      }),
    ]
  );
}

function expectRecoveredSnapshotDroppedExtraFields(): void {
  const savedEntry = saveDiagnostics.mock.calls[0]?.[0] as
    | { meta: Record<string, unknown> }
    | undefined;
  const savedEvents = saveDiagnostics.mock.calls[0]?.[1] as
    | Array<Record<string, unknown>>
    | undefined;
  const savedEventData = savedEvents?.[0]?.['data'] as Record<string, unknown> | undefined;

  expect(savedEntry?.meta).not.toHaveProperty('authorization');
  expect(savedEntry?.meta).not.toHaveProperty('html');
  expect(savedEvents?.[0]).not.toHaveProperty('rawResponse');
  expect(savedEventData).not.toHaveProperty('headers');
  expect(savedEventData).not.toHaveProperty('postData');
}

beforeEach(() => {
  vi.clearAllMocks();
  readStoredDiagnosticSnapshots.mockResolvedValue([]);
  saveDiagnostics.mockResolvedValue(undefined);
  clearStoredDiagnosticSnapshots.mockResolvedValue(undefined);
  replaceStoredDiagnosticSnapshots.mockResolvedValue(undefined);
});

it('returns early when there are no interrupted diagnostics sessions', async () => {
  await recoverInterruptedSessions();

  expect(diagnosticsLogger.debug).toHaveBeenCalledWith(
    'Checking for interrupted diagnostics sessions'
  );
  expect(diagnosticsLogger.debug).toHaveBeenCalledWith('No interrupted diagnostics sessions found');
  expect(saveDiagnostics).not.toHaveBeenCalled();
  expect(clearStoredDiagnosticSnapshots).not.toHaveBeenCalled();
});

it('recovers each stored snapshot, marks it interrupted, and clears storage afterwards', async () => {
  const firstSnapshot = createSnapshot('recording-1', 2);
  const secondSnapshot = createSnapshot('recording-2', 1);
  readStoredDiagnosticSnapshots.mockResolvedValue([firstSnapshot, secondSnapshot]);

  await recoverInterruptedSessions();

  expect(diagnosticsLogger.log).toHaveBeenCalledWith(
    'Recovering interrupted diagnostics sessions',
    { sessionCount: 2 }
  );
  expect(saveDiagnostics).toHaveBeenCalledTimes(2);
  expect(saveDiagnostics).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      recordingId: 'recording-1',
      schemaVersion: 1,
      meta: expect.objectContaining({ interrupted: true }),
    }),
    firstSnapshot.events
  );
  expect(saveDiagnostics).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      recordingId: 'recording-2',
      schemaVersion: 1,
      meta: expect.objectContaining({ interrupted: true }),
    }),
    secondSnapshot.events
  );
  expect(diagnosticsLogger.log).toHaveBeenCalledWith(
    'Recovered interrupted diagnostics session',
    expect.objectContaining({
      eventCount: 2,
      recordingId: 'recording-1',
    })
  );
  expect(clearStoredDiagnosticSnapshots).toHaveBeenCalledOnce();
});

it('recovers interrupted sessions through the shared diagnostics sanitizer', async () => {
  const snapshot = createNetworkRecoverySnapshot();
  addSensitiveRecoveryExtras(snapshot);
  readStoredDiagnosticSnapshots.mockResolvedValue([snapshot]);

  await recoverInterruptedSessions();

  expect(snapshot.meta.interrupted).toBe(false);
  expectRecoveredSnapshotWasSanitized();
  expectRecoveredSnapshotDroppedExtraFields();
});

it('logs and continues when one interrupted session fails to recover', async () => {
  const firstSnapshot = createSnapshot('recording-1', 2);
  const secondSnapshot = createSnapshot('recording-2', 1);
  const recoveryError = new Error('idb write failed');
  readStoredDiagnosticSnapshots.mockResolvedValue([firstSnapshot, secondSnapshot]);
  saveDiagnostics.mockRejectedValueOnce(recoveryError);

  await recoverInterruptedSessions();

  expect(diagnosticsLogger.error).toHaveBeenCalledWith(
    'Failed to recover interrupted diagnostics session recording-1',
    recoveryError
  );
  expect(saveDiagnostics).toHaveBeenCalledTimes(2);
  expect(clearStoredDiagnosticSnapshots).not.toHaveBeenCalled();
  expect(replaceStoredDiagnosticSnapshots).toHaveBeenCalledWith([
    expect.objectContaining({ recordingId: 'recording-1' }),
  ]);
});

it('drains admitted recovery and rejects a late recovery writer during erasure', async () => {
  let resolvePersistence!: () => void;
  readStoredDiagnosticSnapshots.mockResolvedValue([createSnapshot('recording-delayed', 1)]);
  saveDiagnostics.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        resolvePersistence = resolve;
      })
  );

  const recovery = recoverInterruptedSessions();
  await vi.waitFor(() => expect(saveDiagnostics).toHaveBeenCalledOnce());
  const exclusion = reserveDiagnosticsErasureExclusion();
  let drained = false;
  void exclusion.waitForActiveMutations().then(() => {
    drained = true;
  });
  await Promise.resolve();
  expect(drained).toBe(false);

  await recoverInterruptedSessions();
  expect(readStoredDiagnosticSnapshots).toHaveBeenCalledOnce();
  resolvePersistence();
  await recovery;
  await exclusion.waitForActiveMutations();
  exclusion.release();
});
