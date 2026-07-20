import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActiveDiagnosticsSession } from '@sniptale/platform/observability/diagnostics/types';
import type { MaybeFlush } from './cdp.types';
import {
  appendConsoleEvent,
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

function verifyConsoleEventAppend() {
  const session = createSession();
  const maybeFlush = vi.fn();

  appendConsoleEvent(
    session,
    25,
    {
      type: 'log',
      args: [
        {
          value: {
            apiKey: 'secret-key',
            text: 'sensitive text',
          },
        },
      ],
      executionContextId: 1,
      timestamp: 1,
      stackTrace: {
        callFrames: [
          {
            functionName: 'submitForm',
            lineNumber: 4,
            url: 'https://example.test/path?token=123#hash',
          },
        ],
      },
    },
    maybeFlush
  );

  expect(session.events[0]).toMatchObject({
    kind: 'console',
    tsMs: 25,
    message: expect.stringContaining('***'),
    data: {
      argCount: 1,
      stackTrace: [
        {
          functionName: 'submitForm',
          lineNumber: 4,
          url: 'https://example.test/path',
        },
      ],
    },
  });
  expect(maybeFlush).toHaveBeenCalledWith(session);
}

function verifyExceptionEventAppend() {
  const session = createSession();
  const maybeFlush = vi.fn();

  appendExceptionEvent(
    session,
    40,
    {
      exceptionDetails: {
        text: 'Unhandled error',
        exception: {
          description: 'secret failure token=123',
        },
        stackTrace: {
          callFrames: [
            {
              functionName: 'handleSubmit',
              lineNumber: 12,
              url: 'https://example.test/page?secret=1',
            },
          ],
        },
        lineNumber: 12,
        columnNumber: 8,
        url: 'https://example.test/page?secret=1',
      },
    },
    maybeFlush
  );

  expect(session.events[0]).toMatchObject({
    kind: 'error',
    tsMs: 40,
    message: expect.stringContaining('Unhandled error'),
    data: {
      exception: 'secret failure token=***',
      lineNumber: 12,
      columnNumber: 8,
      url: 'https://example.test/page',
    },
  });
  expect(maybeFlush).toHaveBeenCalledWith(session);
}

function appendTrackedNetworkEvents(session: ActiveDiagnosticsSession, maybeFlush: MaybeFlush) {
  appendPendingNetworkRequest(session, 10, {
    requestId: 'req-1',
    request: {
      url: 'https://api.example.test/path?token=123',
      method: 'GET',
      headers: {},
    },
    timestamp: 1,
    type: 'XHR',
  });

  appendNetworkResponseEvent(
    session,
    20,
    {
      requestId: 'req-1',
      response: {
        url: 'https://api.example.test/path?token=123',
        status: 503,
        statusText: 'Service Unavailable token=123',
        mimeType: 'application/json',
      },
      timestamp: 2,
    },
    maybeFlush
  );

  appendPendingNetworkRequest(session, 30, {
    requestId: 'req-2',
    request: {
      url: 'https://api.example.test/other?secret=1',
      method: 'POST',
      headers: {},
    },
    timestamp: 3,
    type: 'Fetch',
  });

  appendNetworkFailureEvent(
    session,
    {
      requestId: 'req-2',
      errorText: 'Connection reset token=123',
      timestamp: 4,
    },
    maybeFlush
  );
}

function expectTrackedNetworkEvents(
  session: ActiveDiagnosticsSession,
  maybeFlush: MaybeFlush & ReturnType<typeof vi.fn>
) {
  expect(session.events).toHaveLength(2);
  expect(session.events[0]).toMatchObject({
    kind: 'network',
    level: 'error',
    message: 'GET https://api.example.test/path',
    data: {
      statusText: 'Service Unavailable token=***',
    },
  });
  expect(session.events[1]).toMatchObject({
    kind: 'network',
    level: 'error',
    message: 'POST https://api.example.test/other FAILED',
    data: {
      error: 'Connection reset token=***',
    },
  });
  expect(session.pendingNetworkRequests.size).toBe(0);
  expect(maybeFlush).toHaveBeenCalledTimes(2);
}

function verifyNetworkEventAppend() {
  const session = createSession();
  const maybeFlush = vi.fn<MaybeFlush>();

  appendTrackedNetworkEvents(session, maybeFlush);
  expectTrackedNetworkEvents(session, maybeFlush);
}

function verifyUnknownNetworkFailureDoesNotAppend() {
  const session = createSession();
  const maybeFlush = vi.fn<MaybeFlush>();

  appendNetworkFailureEvent(
    session,
    {
      requestId: 'missing-request',
      errorText: 'Connection reset',
      timestamp: 4,
    },
    maybeFlush
  );

  expect(session.events).toHaveLength(0);
  expect(maybeFlush).not.toHaveBeenCalled();
}

function verifyNetworkResponseWithoutOptionalMetadata() {
  const session = createSession();
  const maybeFlush = vi.fn<MaybeFlush>();

  appendPendingNetworkRequest(session, 10, {
    requestId: 'req-3',
    request: {
      url: 'https://api.example.test/basic',
      method: 'GET',
      headers: {},
    },
    timestamp: 1,
  });

  appendNetworkResponseEvent(
    session,
    20,
    {
      requestId: 'req-3',
      response: {
        url: 'https://api.example.test/basic',
        status: 200,
        statusText: '',
      },
      timestamp: 2,
    },
    maybeFlush
  );

  expect(session.events[0]).toMatchObject({
    kind: 'network',
    level: 'info',
    message: 'GET https://api.example.test/basic',
  });
}
describe('diagnostic-collector-cdp event appenders', () => {
  it('records sanitized console events and flushes the session', verifyConsoleEventAppend);

  it('records sanitized exception events and flushes the session', verifyExceptionEventAppend);

  it(
    'tracks request, response, and failure network events through the pending request map',
    verifyNetworkEventAppend
  );

  it(
    'ignores network failures for requests that were never tracked',
    verifyUnknownNetworkFailureDoesNotAppend
  );

  it(
    'records network responses even when optional response metadata is absent',
    verifyNetworkResponseWithoutOptionalMetadata
  );
});
