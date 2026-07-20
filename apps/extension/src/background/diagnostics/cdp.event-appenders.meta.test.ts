import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActiveDiagnosticsSession } from '@sniptale/platform/observability/diagnostics/types';
import { appendForcedDetachEvent, appendNavigationEvent } from './cdp.event-appenders';

function createSession(): ActiveDiagnosticsSession {
  return {
    recordingId: 'rec-1',
    tabId: 7,
    startedAt: performance.now() - 10,
    meta: {
      url: 'https://example.test',
      userAgent: 'Vitest',
      viewportWidth: 1280,
      viewportHeight: 720,
      recordingStartedAt: new Date().toISOString(),
    },
    events: [],
    pendingNetworkRequests: new Map(),
    isPaused: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

function verifyNavigationWithoutUrlStillClearsPendingRequests() {
  const session = createSession();
  session.pendingNetworkRequests.set('req-1', {
    requestId: 'req-1',
    url: 'https://example.test/in-flight',
    method: 'GET',
    requestTime: 10,
  });

  appendNavigationEvent(session);

  expect(session.events[0]).toMatchObject({
    kind: 'meta',
    data: { newUrl: undefined },
  });
  expect(session.pendingNetworkRequests.size).toBe(0);
}

function verifyNavigationAndDetachAppend() {
  const session = createSession();
  session.pendingNetworkRequests.set('req-1', {
    requestId: 'req-1',
    url: 'https://example.test/in-flight',
    method: 'GET',
    requestTime: 10,
  });

  appendNavigationEvent(session, 'https://next.example/path?token=123#hash');
  appendForcedDetachEvent(session);

  expect(session.events[0]).toMatchObject({
    kind: 'meta',
    message: 'Page navigation/reload',
    data: {
      newUrl: 'https://next.example/path',
    },
  });
  expect(session.events[1]).toMatchObject({
    kind: 'meta',
    message: 'Debugger forcibly detached',
  });
  expect(session.pendingNetworkRequests.size).toBe(0);
}

describe('diagnostic-collector-cdp meta event appenders', () => {
  it(
    'records navigation and forced-detach meta events while clearing pending requests',
    verifyNavigationAndDetachAppend
  );

  it(
    'records navigation events without a new URL and still clears pending requests',
    verifyNavigationWithoutUrlStillClearsPendingRequests
  );
});
