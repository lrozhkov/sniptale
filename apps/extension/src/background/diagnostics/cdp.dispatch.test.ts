import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActiveDiagnosticsSession } from '@sniptale/platform/observability/diagnostics/types';
import type { MaybeFlush } from './cdp.types';

const appenders = vi.hoisted(() => ({
  appendConsoleEvent: vi.fn(),
  appendExceptionEvent: vi.fn(),
  appendNetworkFailureEvent: vi.fn(),
  appendNetworkResponseEvent: vi.fn(),
  appendPendingNetworkRequest: vi.fn(),
}));

vi.mock('./cdp.event-appenders', () => appenders);

import { dispatchDebuggerEvent } from './cdp.dispatch';

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

function dispatchEvent(method: string, params: unknown) {
  dispatchDebuggerEvent({
    method,
    session: createSession(),
    tsMs: 25,
    params,
    maybeFlush: vi.fn<MaybeFlush>(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

function expectValidConsoleRoute() {
  const params = {
    type: 'log',
    args: [{ value: 'hello' }],
    executionContextId: 1,
    timestamp: 1,
  };

  dispatchEvent('Runtime.consoleAPICalled', params);

  expect(appenders.appendConsoleEvent).toHaveBeenCalledWith(
    expect.objectContaining({ recordingId: 'rec-1' }),
    25,
    params,
    expect.any(Function)
  );
}

function expectInvalidConsoleDrop() {
  dispatchEvent('Runtime.consoleAPICalled', { type: 'log', args: 'bad-payload' });

  expect(appenders.appendConsoleEvent).not.toHaveBeenCalled();
}

function expectValidExceptionRoute() {
  const params = {
    exceptionDetails: {
      text: 'Unhandled error',
    },
  };

  dispatchEvent('Runtime.exceptionThrown', params);

  expect(appenders.appendExceptionEvent).toHaveBeenCalledWith(
    expect.objectContaining({ recordingId: 'rec-1' }),
    25,
    params,
    expect.any(Function)
  );
}

function expectValidRequestAndResponseRoute() {
  const requestParams = {
    requestId: 'req-1',
    request: {
      url: 'https://example.test/api',
      method: 'GET',
      headers: {},
    },
    timestamp: 1,
    type: 'XHR',
  };
  const responseParams = {
    requestId: 'req-1',
    response: {
      url: 'https://example.test/api',
      status: 200,
      statusText: 'OK',
      mimeType: 'application/json',
    },
    timestamp: 2,
  };

  dispatchEvent('Network.requestWillBeSent', requestParams);
  dispatchEvent('Network.responseReceived', responseParams);

  expect(appenders.appendPendingNetworkRequest).toHaveBeenCalledWith(
    expect.objectContaining({ recordingId: 'rec-1' }),
    25,
    requestParams
  );
  expect(appenders.appendNetworkResponseEvent).toHaveBeenCalledWith(
    expect.objectContaining({ recordingId: 'rec-1' }),
    25,
    responseParams,
    expect.any(Function)
  );
}

function expectInvalidResponseDrop() {
  dispatchEvent('Network.responseReceived', {
    requestId: 'req-1',
    response: {
      status: '200',
    },
  });

  expect(appenders.appendNetworkResponseEvent).not.toHaveBeenCalled();
}

function expectValidLoadingFailureRoute() {
  const params = {
    requestId: 'req-1',
    errorText: 'Connection reset',
    timestamp: 3,
  };

  dispatchEvent('Network.loadingFailed', params);

  expect(appenders.appendNetworkFailureEvent).toHaveBeenCalledWith(
    expect.objectContaining({ recordingId: 'rec-1' }),
    params,
    expect.any(Function)
  );
}

function expectInvalidLoadingFailureAndUnrelatedMethodDrop() {
  dispatchEvent('Network.loadingFailed', { requestId: 'req-1' });
  dispatchEvent('Page.frameNavigated', { frame: { id: '1' } });

  expect(appenders.appendNetworkFailureEvent).not.toHaveBeenCalled();
  expect(appenders.appendConsoleEvent).not.toHaveBeenCalled();
  expect(appenders.appendExceptionEvent).not.toHaveBeenCalled();
  expect(appenders.appendPendingNetworkRequest).not.toHaveBeenCalled();
  expect(appenders.appendNetworkResponseEvent).not.toHaveBeenCalled();
}

describe('dispatchDebuggerEvent', () => {
  it('routes valid console events to the console appender', expectValidConsoleRoute);
  it('drops invalid console payloads at the type guard', expectInvalidConsoleDrop);
  it('routes valid exception events to the exception appender', expectValidExceptionRoute);
  it(
    'routes valid request and response events to their network appenders',
    expectValidRequestAndResponseRoute
  );
  it('drops invalid response payloads at the type guard', expectInvalidResponseDrop);
  it('routes valid loading failures to the failure appender', expectValidLoadingFailureRoute);
  it(
    'ignores invalid loading failures and unrelated methods',
    expectInvalidLoadingFailureAndUnrelatedMethodDrop
  );
});
