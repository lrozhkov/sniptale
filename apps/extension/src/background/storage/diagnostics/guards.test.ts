import { expect, it } from 'vitest';

import { parseStoredDiagnosticSnapshots } from './guards';

function createValidSnapshot() {
  return {
    recordingId: 'recording-1',
    tabId: 7,
    startedAt: 100,
    meta: {
      url: 'https://example.com/page',
      userAgent: 'Sniptale UA',
      viewportWidth: 1280,
      viewportHeight: 720,
      recordingStartedAt: '2026-03-21T12:00:00.000Z',
      recordingEndedAt: '2026-03-21T12:05:00.000Z',
      interrupted: false,
    },
    events: [
      {
        id: 'event-1',
        recordingId: 'recording-1',
        tsMs: 10,
        kind: 'console',
        level: 'warn',
        message: 'warn',
      },
      {
        id: 'event-2',
        recordingId: 'recording-1',
        tsMs: 20,
        kind: 'meta',
        message: 'meta',
      },
    ],
    pendingNetworkRequests: [
      {
        requestId: 'request-1',
        url: 'https://example.com/api',
        method: 'POST',
        requestTime: 15,
        status: 200,
        statusText: 'OK',
        responseTime: 16,
        mimeType: 'application/json',
        error: 'none',
        resourceType: 'Fetch',
      },
    ],
    isPaused: true,
  };
}

it('returns an empty array for non-array storage payloads', () => {
  expect(parseStoredDiagnosticSnapshots({ invalid: true })).toEqual([]);
});

it('keeps valid snapshots and drops malformed nested entries', () => {
  const snapshots = parseStoredDiagnosticSnapshots([
    {
      ...createValidSnapshot(),
      events: [
        ...createValidSnapshot().events,
        {
          id: 'bad-event',
          recordingId: 'recording-1',
          tsMs: 30,
          kind: 'console',
          level: 'verbose',
          message: 'bad level',
        },
      ],
      pendingNetworkRequests: [
        ...createValidSnapshot().pendingNetworkRequests,
        {
          requestId: 'bad-request',
          url: 'https://example.com/bad',
          method: 'GET',
          requestTime: 'invalid',
        },
      ],
    },
  ]);

  expect(snapshots).toEqual([
    expect.objectContaining({
      recordingId: 'recording-1',
      events: [
        expect.objectContaining({ id: 'event-1', level: 'warn' }),
        expect.objectContaining({ id: 'event-2', kind: 'meta' }),
      ],
      pendingNetworkRequests: [
        expect.objectContaining({
          requestId: 'request-1',
          status: 200,
          statusText: 'OK',
          responseTime: 16,
          mimeType: 'application/json',
          error: 'none',
          resourceType: 'Fetch',
        }),
      ],
    }),
  ]);
});

it('drops snapshots with malformed optional metadata fields', () => {
  const malformedSnapshot = {
    ...createValidSnapshot(),
    meta: {
      ...createValidSnapshot().meta,
      interrupted: 'yes',
    },
  };

  expect(parseStoredDiagnosticSnapshots([malformedSnapshot])).toEqual([]);
});

it('accepts snapshots when optional metadata fields are absent', () => {
  const validSnapshot = createValidSnapshot();
  const snapshot = {
    ...validSnapshot,
    meta: {
      url: validSnapshot.meta.url,
      userAgent: validSnapshot.meta.userAgent,
      viewportWidth: validSnapshot.meta.viewportWidth,
      viewportHeight: validSnapshot.meta.viewportHeight,
      recordingStartedAt: validSnapshot.meta.recordingStartedAt,
    },
  };

  expect(parseStoredDiagnosticSnapshots([snapshot])).toEqual([
    expect.objectContaining({
      recordingId: 'recording-1',
      meta: expect.objectContaining({
        recordingStartedAt: '2026-03-21T12:00:00.000Z',
      }),
    }),
  ]);
});

it('normalizes stored snapshots by dropping unexpected top-level fields', () => {
  const snapshot = createValidSnapshot();
  const [event] = snapshot.events;
  const [request] = snapshot.pendingNetworkRequests;
  if (event === undefined || request === undefined) {
    throw new Error('Expected valid snapshot fixture entries');
  }

  Object.assign(snapshot.meta, {
    authorization: 'Bearer secret',
    html: '<input value="secret">',
  });
  Object.assign(event, { rawResponse: 'token=secret' });
  Object.assign(request, {
    headers: { cookie: 'session=secret' },
    postData: 'private user text',
  });

  const [parsed] = parseStoredDiagnosticSnapshots([snapshot]);

  expect(parsed?.meta).not.toHaveProperty('authorization');
  expect(parsed?.meta).not.toHaveProperty('html');
  expect(parsed?.events[0]).not.toHaveProperty('rawResponse');
  expect(parsed?.pendingNetworkRequests[0]).not.toHaveProperty('headers');
  expect(parsed?.pendingNetworkRequests[0]).not.toHaveProperty('postData');
});
