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
  BrowserStorageAdapter: undefined,
  BrowserStorageAreaAdapter: undefined,
  BrowserStorageChangeListener: undefined,
  BrowserStorageChanges: undefined,
  BrowserStorageGetKeys: undefined,
  BrowserStorageSetItems: undefined,
  browserStorage,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => diagnosticsLogger,
}));

import {
  clearDiagnosticsSessionFromStorage,
  replaceStoredDiagnosticSnapshots,
} from './active-sessions';

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

beforeEach(() => {
  vi.clearAllMocks();
  browserStorage.session.get.mockResolvedValue({});
  browserStorage.session.set.mockResolvedValue(undefined);
  browserStorage.session.remove.mockResolvedValue(undefined);
});

it('replaces stored diagnostics snapshots after sanitizing optional text fields', async () => {
  await replaceStoredDiagnosticSnapshots([
    {
      ...createStoredSnapshot('recording-3', 9, true),
      meta: {
        ...createStoredSnapshot('recording-3', 9, true).meta,
        recordingEndedAt: 'ended token=123',
      },
      pendingNetworkRequests: [
        {
          requestId: 'request-3',
          url: 'https://example.com/api?token=123',
          method: 'GET',
          requestTime: 10,
          statusText: 'secret failure',
          error: 'secret stack',
        },
      ],
    },
  ]);

  expect(browserStorage.session.set).toHaveBeenCalledWith({
    'diagnostics-active-sessions': [
      expect.objectContaining({
        meta: expect.objectContaining({
          recordingEndedAt: 'ended token=***',
        }),
        pendingNetworkRequests: [
          expect.objectContaining({
            url: 'https://example.com/api',
            statusText: 'secret failure',
            error: 'secret stack',
          }),
        ],
      }),
    ],
  });
});

it('removes the diagnostics storage key when the last stored snapshot is cleared', async () => {
  browserStorage.session.get.mockResolvedValue({
    'diagnostics-active-sessions': [createStoredSnapshot('recording-last', 11)],
  });

  await clearDiagnosticsSessionFromStorage('recording-last');

  expect(browserStorage.session.remove).toHaveBeenCalledWith('diagnostics-active-sessions');
  expect(browserStorage.session.set).not.toHaveBeenCalled();
});
