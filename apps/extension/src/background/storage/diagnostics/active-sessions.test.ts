import { beforeEach, expect, it, vi } from 'vitest';

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
  clearStoredDiagnosticSnapshots,
  readStoredDiagnosticSnapshots,
  restoreStoredDiagnosticsSession,
  saveActiveDiagnosticsSessionsToStorage,
} from './active-sessions';

function createSession(recordingId: string, tabId: number) {
  return {
    recordingId,
    tabId,
    startedAt: 100,
    meta: {
      url: 'https://example.com',
      userAgent: 'Sniptale Test UA',
      viewportWidth: 1280,
      viewportHeight: 720,
      recordingStartedAt: '2026-03-21T12:00:00.000Z',
    },
    events: [
      {
        id: `${recordingId}-event-1`,
        recordingId,
        tsMs: 10,
        kind: 'network' as const,
        message: 'request',
      },
    ],
    pendingNetworkRequests: new Map([
      [
        'request-1',
        {
          requestId: 'request-1',
          url: 'https://example.com/api',
          method: 'GET',
          requestTime: 10,
        },
      ],
    ]),
    isPaused: false,
  };
}

function createStoredSnapshot(recordingId: string, tabId: number, isPaused = false) {
  return {
    recordingId,
    tabId,
    startedAt: 100,
    meta: {
      url: 'https://example.com',
      userAgent: 'Sniptale Test UA',
      viewportWidth: 1280,
      viewportHeight: 720,
      recordingStartedAt: '2026-03-21T12:00:00.000Z',
    },
    events: [],
    pendingNetworkRequests: [],
    isPaused,
  };
}

function createMalformedDiagnosticsStoragePayload() {
  return {
    'diagnostics-active-sessions': [
      'invalid-root-entry',
      {
        recordingId: 'recording-valid',
        tabId: 10,
        startedAt: 250,
        meta: {
          url: 'https://example.com',
          userAgent: 'Sniptale Test UA',
          viewportWidth: 1280,
          viewportHeight: 720,
          recordingStartedAt: '2026-03-21T12:00:00.000Z',
        },
        events: [
          {
            id: 'event-1',
            recordingId: 'recording-valid',
            tsMs: 10,
            kind: 'action',
            message: 'clicked',
          },
          {
            id: 'event-invalid',
            tsMs: 20,
          },
        ],
        pendingNetworkRequests: [
          {
            requestId: 'request-valid',
            url: 'https://example.com/resource',
            method: 'POST',
            requestTime: 15,
          },
          {
            requestId: 123,
          },
        ],
        isPaused: false,
      },
      {
        recordingId: 'recording-invalid',
        tabId: 'bad-tab',
      },
    ],
  };
}

function expectFilteredDiagnosticsSnapshots(
  snapshots: Awaited<ReturnType<typeof readStoredDiagnosticSnapshots>>,
  restored: Awaited<ReturnType<typeof restoreStoredDiagnosticsSession>>
) {
  expect(snapshots).toEqual([
    expect.objectContaining({
      recordingId: 'recording-valid',
      events: [
        expect.objectContaining({
          id: 'event-1',
        }),
      ],
      pendingNetworkRequests: [
        expect.objectContaining({
          requestId: 'request-valid',
        }),
      ],
    }),
  ]);
  expect(restored?.pendingNetworkRequests.has('request-valid')).toBe(true);
  expect(restored?.pendingNetworkRequests.size).toBe(1);
}

beforeEach(() => {
  vi.clearAllMocks();
  browserStorage.session.get.mockResolvedValue({});
  browserStorage.session.set.mockResolvedValue(undefined);
  browserStorage.session.remove.mockResolvedValue(undefined);
});

it('serializes active diagnostics sessions into storage snapshots', async () => {
  const session = createSession('recording-1', 7);

  await saveActiveDiagnosticsSessionsToStorage([session]);

  expect(browserStorage.session.set).toHaveBeenCalledWith({
    'diagnostics-active-sessions': [
      expect.objectContaining({
        recordingId: 'recording-1',
        tabId: 7,
        events: session.events,
        pendingNetworkRequests: [
          expect.objectContaining({
            requestId: 'request-1',
          }),
        ],
      }),
    ],
  });
  expect(diagnosticsLogger.debug).toHaveBeenCalledWith(
    'Saved active diagnostics sessions to storage',
    { sessionCount: 1 }
  );
});

it('removes the storage key when there are no active diagnostics sessions', async () => {
  await saveActiveDiagnosticsSessionsToStorage([]);

  expect(browserStorage.session.remove).toHaveBeenCalledWith('diagnostics-active-sessions');
  expect(browserStorage.session.set).not.toHaveBeenCalled();
});

it('restores hydrated sessions and exposes raw stored snapshots', async () => {
  browserStorage.session.get.mockResolvedValue({
    'diagnostics-active-sessions': [
      {
        recordingId: 'recording-2',
        tabId: 9,
        startedAt: 200,
        meta: {
          url: 'https://example.com',
          userAgent: 'Sniptale Test UA',
          viewportWidth: 1280,
          viewportHeight: 720,
          recordingStartedAt: '2026-03-21T12:00:00.000Z',
        },
        events: [],
        pendingNetworkRequests: [
          {
            requestId: 'request-2',
            url: 'https://example.com/resource',
            method: 'POST',
            requestTime: 15,
          },
        ],
        isPaused: true,
      },
    ],
  });

  const restored = await restoreStoredDiagnosticsSession('recording-2');
  const snapshots = await readStoredDiagnosticSnapshots();

  expect(restored).toMatchObject({
    recordingId: 'recording-2',
    tabId: 9,
    isPaused: true,
  });
  expect(restored?.pendingNetworkRequests.get('request-2')).toEqual(
    expect.objectContaining({
      requestId: 'request-2',
    })
  );
  expect(snapshots).toHaveLength(1);
  await expect(restoreStoredDiagnosticsSession('missing-recording')).resolves.toBeNull();
});

it('drops malformed diagnostics snapshots instead of crashing recovery paths', async () => {
  browserStorage.session.get.mockResolvedValue(createMalformedDiagnosticsStoragePayload());

  const snapshots = await readStoredDiagnosticSnapshots();
  const restored = await restoreStoredDiagnosticsSession('recording-valid');

  expectFilteredDiagnosticsSnapshots(snapshots, restored);
});

it('clears individual sessions and the whole snapshot key through the browser seam', async () => {
  browserStorage.session.get.mockResolvedValue({
    'diagnostics-active-sessions': [
      createStoredSnapshot('recording-1', 7),
      createStoredSnapshot('recording-2', 8),
    ],
  });

  await clearDiagnosticsSessionFromStorage('recording-1');
  expect(browserStorage.session.set).toHaveBeenCalledWith({
    'diagnostics-active-sessions': [
      expect.objectContaining({
        recordingId: 'recording-2',
      }),
    ],
  });

  await clearStoredDiagnosticSnapshots();
  expect(browserStorage.session.remove).toHaveBeenCalledWith('diagnostics-active-sessions');
});

it('clears all stored diagnostics snapshots directly through the storage seam', async () => {
  await clearStoredDiagnosticSnapshots();

  expect(browserStorage.session.remove).toHaveBeenCalledWith('diagnostics-active-sessions');
});
