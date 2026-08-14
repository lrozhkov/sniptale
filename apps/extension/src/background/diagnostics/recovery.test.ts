import { beforeEach, expect, it, vi } from 'vitest';
import type { SessionSnapshot } from '@sniptale/platform/observability/diagnostics/types';

const {
  clearStoredDiagnosticSnapshots,
  diagnosticsLogger,
  readStoredDiagnosticSnapshots,
  replaceStoredDiagnosticSnapshots,
  saveDiagnostics,
} = vi.hoisted(() => ({
  clearStoredDiagnosticSnapshots: vi.fn(),
  diagnosticsLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
  },
  readStoredDiagnosticSnapshots: vi.fn(),
  replaceStoredDiagnosticSnapshots: vi.fn(),
  saveDiagnostics: vi.fn(),
}));

vi.mock('../../composition/persistence/diagnostics/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/diagnostics/index')>()),
  saveDiagnostics,
}));

vi.mock('./logger', () => ({ diagnosticsLogger }));

vi.mock('../storage/diagnostics/active-sessions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../storage/diagnostics/active-sessions')>()),
  clearStoredDiagnosticSnapshots,
  readStoredDiagnosticSnapshots,
  replaceStoredDiagnosticSnapshots,
}));

import { reserveDiagnosticsErasureExclusion } from './lifecycle-gate';
import { recoverInterruptedSessions } from './recovery';

function createSnapshot(recordingId: string): SessionSnapshot {
  return {
    recordingId,
    tabId: 7,
    startedAt: 1_000,
    meta: {
      interrupted: false,
      recordingStartedAt: '2026-03-21T12:00:00.000Z',
      url: 'https://example.com/start?token=secret#fragment',
      userAgent: 'Sniptale Test UA token=secret',
      viewportHeight: 720,
      viewportWidth: 1280,
    },
    events: [
      {
        id: `${recordingId}-action`,
        kind: 'action',
        message: 'Clicked token=secret',
        recordingId,
        tsMs: 10,
        data: { authorization: 'Bearer secret' },
      },
      {
        id: `${recordingId}-error`,
        kind: 'error',
        message: 'Failed token=secret',
        recordingId,
        tsMs: 20,
      },
      {
        id: `${recordingId}-meta`,
        kind: 'meta',
        message: 'marker',
        recordingId,
        tsMs: 30,
      },
    ],
    isPaused: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  readStoredDiagnosticSnapshots.mockResolvedValue([]);
  saveDiagnostics.mockResolvedValue(undefined);
  clearStoredDiagnosticSnapshots.mockResolvedValue(undefined);
  replaceStoredDiagnosticSnapshots.mockResolvedValue(undefined);
});

it('returns early when no interrupted interaction sessions exist', async () => {
  await recoverInterruptedSessions();

  expect(saveDiagnostics).not.toHaveBeenCalled();
  expect(clearStoredDiagnosticSnapshots).not.toHaveBeenCalled();
});

it('recovers action, error, and meta events as schema v2 then clears session state', async () => {
  readStoredDiagnosticSnapshots.mockResolvedValue([
    createSnapshot('recording-1'),
    createSnapshot('recording-2'),
  ]);

  await recoverInterruptedSessions();

  expect(saveDiagnostics).toHaveBeenCalledTimes(2);
  expect(saveDiagnostics).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      recordingId: 'recording-1',
      schemaVersion: 2,
      meta: expect.objectContaining({
        interrupted: true,
        url: 'https://example.com/start',
        userAgent: 'Sniptale Test UA token=***',
      }),
    }),
    [
      expect.objectContaining({ kind: 'action', data: { authorization: '***' } }),
      expect.objectContaining({ kind: 'error' }),
      expect.objectContaining({ kind: 'meta' }),
    ]
  );
  expect(clearStoredDiagnosticSnapshots).toHaveBeenCalledOnce();
});

it('retains only failed snapshots for the next recovery attempt', async () => {
  const first = createSnapshot('recording-1');
  const second = createSnapshot('recording-2');
  const error = new Error('idb write failed');
  readStoredDiagnosticSnapshots.mockResolvedValue([first, second]);
  saveDiagnostics.mockRejectedValueOnce(error);

  await recoverInterruptedSessions();

  expect(diagnosticsLogger.error).toHaveBeenCalledWith(
    'Failed to recover interrupted diagnostics session recording-1',
    error
  );
  expect(clearStoredDiagnosticSnapshots).not.toHaveBeenCalled();
  expect(replaceStoredDiagnosticSnapshots).toHaveBeenCalledWith([first]);
});

it('drains admitted recovery and rejects a late recovery writer during erasure', async () => {
  let resolvePersistence!: () => void;
  readStoredDiagnosticSnapshots.mockResolvedValue([createSnapshot('recording-delayed')]);
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
