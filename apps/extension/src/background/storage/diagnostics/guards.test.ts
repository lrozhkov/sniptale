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
        id: 'event-action',
        recordingId: 'recording-1',
        tsMs: 10,
        kind: 'action',
        level: 'info',
        message: 'click',
      },
      {
        id: 'event-error',
        recordingId: 'recording-1',
        tsMs: 20,
        kind: 'error',
        level: 'error',
        message: 'failure',
      },
      {
        id: 'event-meta',
        recordingId: 'recording-1',
        tsMs: 30,
        kind: 'meta',
        message: 'marker',
      },
    ],
    isPaused: true,
  };
}

it('returns an empty array for non-array storage payloads', () => {
  expect(parseStoredDiagnosticSnapshots({ invalid: true })).toEqual([]);
});

it('keeps action, error, and meta events while dropping retired and malformed entries', () => {
  const snapshots = parseStoredDiagnosticSnapshots([
    {
      ...createValidSnapshot(),
      events: [
        ...createValidSnapshot().events,
        {
          id: 'retired-network',
          recordingId: 'recording-1',
          tsMs: 40,
          kind: 'network',
          message: 'retired',
        },
        {
          id: 'bad-level',
          recordingId: 'recording-1',
          tsMs: 50,
          kind: 'action',
          level: 'verbose',
          message: 'bad',
        },
      ],
    },
  ]);

  expect(snapshots[0]?.events.map((event) => event.kind)).toEqual(['action', 'error', 'meta']);
});

it('drops invalid snapshots and normalizes unexpected fields', () => {
  const snapshot = createValidSnapshot();
  Object.assign(snapshot, { retiredState: 'discard me' });
  Object.assign(snapshot.meta, { authorization: 'Bearer secret', html: '<input>' });
  Object.assign(snapshot.events[0] ?? {}, { rawResponse: 'secret' });

  expect(
    parseStoredDiagnosticSnapshots([
      { ...snapshot, meta: { ...snapshot.meta, interrupted: 'yes' } },
    ])
  ).toEqual([]);

  const [parsed] = parseStoredDiagnosticSnapshots([snapshot]);
  expect(parsed).not.toHaveProperty('retiredState');
  expect(parsed?.meta).not.toHaveProperty('authorization');
  expect(parsed?.meta).not.toHaveProperty('html');
  expect(parsed?.events[0]).not.toHaveProperty('rawResponse');
});
