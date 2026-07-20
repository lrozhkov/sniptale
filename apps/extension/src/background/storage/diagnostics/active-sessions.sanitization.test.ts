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

import { saveActiveDiagnosticsSessionsToStorage } from './active-sessions';

function createSession() {
  return {
    recordingId: 'recording-3',
    tabId: 11,
    startedAt: 100,
    rawDiagnostics: 'token=secret',
    meta: {
      authorization: 'Bearer secret',
      html: '<input value="secret">',
      url: 'https://example.com/app?token=secret#fragment',
      userAgent: 'Sniptale Test UA',
      viewportWidth: 1280,
      viewportHeight: 720,
      recordingStartedAt: '2026-03-21T12:00:00.000Z',
      recordingEndedAt: '2026-03-21T12:05:00.000Z',
    },
    events: [
      {
        id: 'recording-3-event-1',
        recordingId: 'recording-3',
        tsMs: 10,
        kind: 'network' as const,
        message: 'request?token=secret',
        rawResponse: 'token=secret',
        data: { authorization: 'Bearer secret' },
      },
    ],
    pendingNetworkRequests: new Map([
      [
        'request-3',
        {
          requestId: 'request-3',
          url: 'https://example.com/api?token=secret#fragment',
          method: 'GET',
          requestTime: 10,
          statusText: 'OK',
          error: 'none',
          headers: { cookie: 'session=secret' },
          postData: 'private user text',
        },
      ],
    ]),
    isPaused: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  browserStorage.session.set.mockResolvedValue(undefined);
  browserStorage.session.remove.mockResolvedValue(undefined);
  browserStorage.session.get.mockResolvedValue({});
});

it('sanitizes persisted diagnostic urls and nested event payloads before session storage', async () => {
  await saveActiveDiagnosticsSessionsToStorage([createSession()]);

  expect(browserStorage.session.set).toHaveBeenCalledWith({
    'diagnostics-active-sessions': [
      expect.objectContaining({
        meta: expect.objectContaining({
          url: 'https://example.com/app',
          recordingEndedAt: '2026-03-21T12:05:00.000Z',
        }),
        events: [
          expect.objectContaining({
            data: { authorization: '***' },
          }),
        ],
        pendingNetworkRequests: [
          expect.objectContaining({
            requestId: 'request-3',
            url: 'https://example.com/api',
            statusText: 'OK',
            error: 'none',
          }),
        ],
      }),
    ],
  });
  const storedPayload = browserStorage.session.set.mock.calls[0]?.[0] as
    | {
        'diagnostics-active-sessions': Array<{
          events: Array<Record<string, unknown>>;
          meta: Record<string, unknown>;
          pendingNetworkRequests: Array<Record<string, unknown>>;
        }>;
      }
    | undefined;
  const storedSnapshot = storedPayload?.['diagnostics-active-sessions'][0];

  expect(storedSnapshot?.meta).not.toHaveProperty('authorization');
  expect(storedSnapshot?.meta).not.toHaveProperty('html');
  expect(storedSnapshot).not.toHaveProperty('rawDiagnostics');
  expect(storedSnapshot?.events[0]).not.toHaveProperty('rawResponse');
  expect(storedSnapshot?.pendingNetworkRequests[0]).not.toHaveProperty('headers');
  expect(storedSnapshot?.pendingNetworkRequests[0]).not.toHaveProperty('postData');
});
