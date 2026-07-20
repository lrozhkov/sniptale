import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActiveDiagnosticsSession } from '@sniptale/platform/observability/diagnostics/types';
import type { MaybeFlush } from './cdp.types';
import {
  appendExceptionEvent,
  appendNetworkFailureEvent,
  appendNetworkResponseEvent,
  appendPendingNetworkRequest,
} from './cdp.event-appenders';

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

function verifyExceptionFallbackAppend() {
  const session = createSession();
  const maybeFlush = vi.fn();

  appendExceptionEvent(
    session,
    55,
    {
      exceptionDetails: {
        text: '',
      },
    },
    maybeFlush
  );

  expect(session.events[0]).toMatchObject({
    kind: 'error',
    tsMs: 55,
    message: 'Unknown error',
    data: {
      exception: undefined,
      url: undefined,
    },
  });
  expect(maybeFlush).toHaveBeenCalledWith(session);
}

function appendInfoRequestAndResponse(session: ActiveDiagnosticsSession, maybeFlush: MaybeFlush) {
  appendPendingNetworkRequest(session, 5, {
    requestId: 'req-info',
    request: {
      url: 'not a url',
      method: 'PUT',
      headers: {},
    },
    timestamp: 1,
    type: 'Fetch',
  });

  appendNetworkResponseEvent(
    session,
    15,
    {
      requestId: 'req-info',
      response: {
        url: 'not a url',
        status: 204,
        statusText: 'No Content',
      },
      timestamp: 2,
    },
    maybeFlush
  );
}

function appendMissingPendingResponseAndFailure(
  session: ActiveDiagnosticsSession,
  maybeFlush: MaybeFlush
) {
  appendNetworkResponseEvent(
    session,
    20,
    {
      requestId: 'missing-response',
      response: {
        url: 'https://example.test/missing',
        status: 200,
        statusText: 'OK',
      },
      timestamp: 3,
    },
    maybeFlush
  );

  appendNetworkFailureEvent(
    session,
    {
      requestId: 'missing-failure',
      errorText: 'Timeout',
      timestamp: 4,
    },
    maybeFlush
  );
}

function verifyNetworkRequestFallbacksAndNoops() {
  const session = createSession();
  const maybeFlush = vi.fn<MaybeFlush>();

  appendInfoRequestAndResponse(session, maybeFlush);
  appendMissingPendingResponseAndFailure(session, maybeFlush);

  expect(session.events).toHaveLength(1);
  expect(session.events[0]).toMatchObject({
    kind: 'network',
    level: 'info',
    message: 'PUT not a url',
  });
  expect(maybeFlush).toHaveBeenCalledTimes(1);
}

describe('diagnostic-collector-cdp event appender fallbacks', () => {
  it(
    'falls back to a generic error message when exception details are empty',
    verifyExceptionFallbackAppend
  );

  it(
    'keeps fallback request urls, info responses, and missing pending requests predictable',
    verifyNetworkRequestFallbacksAndNoops
  );
});
