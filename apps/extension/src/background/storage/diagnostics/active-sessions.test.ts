import { beforeEach, expect, it, vi } from 'vitest';
import type { ActiveDiagnosticsSession } from '@sniptale/platform/observability/diagnostics/types';

const { browserStorage, diagnosticsLogger } = vi.hoisted(() => ({
  browserStorage: {
    session: {
      get: vi.fn(),
      remove: vi.fn(),
      set: vi.fn(),
    },
  },
  diagnosticsLogger: {
    debug: vi.fn(),
  },
}));

vi.mock('../../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => diagnosticsLogger,
}));

import {
  clearDiagnosticsSessionFromStorage,
  clearRetiredDiagnosticSnapshots,
  clearStoredDiagnosticSnapshots,
  readStoredDiagnosticSnapshots,
  replaceStoredDiagnosticSnapshots,
  restoreStoredDiagnosticsSession,
  saveActiveDiagnosticsSessionsToStorage,
} from './active-sessions';

const STORAGE_KEY = 'interaction-diagnostics-active-sessions';

function createSession(recordingId = 'recording-1', tabId = 7): ActiveDiagnosticsSession {
  return {
    recordingId,
    tabId,
    startedAt: 100,
    meta: {
      url: 'https://example.com/app?token=secret#fragment',
      userAgent: 'Sniptale Test UA token=secret',
      viewportWidth: 1280,
      viewportHeight: 720,
      recordingStartedAt: '2026-03-21T12:00:00.000Z',
    },
    events: [
      {
        id: `${recordingId}-action`,
        recordingId,
        tsMs: 10,
        kind: 'action',
        message: 'Clicked token=secret',
        data: { authorization: 'Bearer secret' },
      },
      {
        id: `${recordingId}-error`,
        recordingId,
        tsMs: 20,
        kind: 'error',
        level: 'error',
        message: 'Failed token=secret',
      },
      {
        id: `${recordingId}-meta`,
        recordingId,
        tsMs: 30,
        kind: 'meta',
        message: 'Recording marker',
      },
    ],
    isPaused: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  browserStorage.session.get.mockResolvedValue({});
  browserStorage.session.set.mockResolvedValue(undefined);
  browserStorage.session.remove.mockResolvedValue(undefined);
});

it('stores only sanitized interaction diagnostics under the v2 session key', async () => {
  await saveActiveDiagnosticsSessionsToStorage([createSession()]);

  expect(browserStorage.session.set).toHaveBeenCalledWith({
    [STORAGE_KEY]: [
      expect.objectContaining({
        recordingId: 'recording-1',
        meta: expect.objectContaining({
          url: 'https://example.com/app',
          userAgent: 'Sniptale Test UA token=***',
        }),
        events: [
          expect.objectContaining({ kind: 'action', data: { authorization: '***' } }),
          expect.objectContaining({ kind: 'error' }),
          expect.objectContaining({ kind: 'meta' }),
        ],
      }),
    ],
  });
  expect(diagnosticsLogger.debug).toHaveBeenCalledWith(
    'Saved active diagnostics sessions to storage',
    { sessionCount: 1 }
  );
});

it('restores valid v2 snapshots and drops malformed or retired event kinds', async () => {
  const snapshot = createSession('recording-valid', 9);
  browserStorage.session.get.mockResolvedValue({
    [STORAGE_KEY]: [
      {
        ...snapshot,
        events: [
          ...snapshot.events,
          {
            id: 'retired-event',
            recordingId: 'recording-valid',
            tsMs: 40,
            kind: 'network',
            message: 'retired',
          },
        ],
      },
      { recordingId: 'malformed', tabId: 'not-a-number' },
    ],
  });

  const snapshots = await readStoredDiagnosticSnapshots();
  const restored = await restoreStoredDiagnosticsSession('recording-valid');

  expect(snapshots).toHaveLength(1);
  expect(restored?.events.map((event) => event.kind)).toEqual(['action', 'error', 'meta']);
  await expect(restoreStoredDiagnosticsSession('missing')).resolves.toBeNull();
});

it('replaces, removes, and clears v2 snapshots without reading legacy state', async () => {
  const first = createSession('recording-1', 7);
  const second = createSession('recording-2', 8);
  browserStorage.session.get.mockResolvedValue({ [STORAGE_KEY]: [first, second] });

  await clearDiagnosticsSessionFromStorage('recording-1');
  expect(browserStorage.session.set).toHaveBeenCalledWith({
    [STORAGE_KEY]: [expect.objectContaining({ recordingId: 'recording-2' })],
  });

  await replaceStoredDiagnosticSnapshots([]);
  await clearStoredDiagnosticSnapshots();
  await clearRetiredDiagnosticSnapshots();

  expect(browserStorage.session.remove).toHaveBeenCalledWith(STORAGE_KEY);
  expect(browserStorage.session.remove).toHaveBeenCalledWith('diagnostics-active-sessions');
  expect(browserStorage.session.get).not.toHaveBeenCalledWith('diagnostics-active-sessions');
});
