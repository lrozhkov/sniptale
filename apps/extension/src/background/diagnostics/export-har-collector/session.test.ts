import { beforeEach, describe, expect, it, vi } from 'vitest';

const browserDebuggerSendCommandMock = vi.hoisted(() => vi.fn());
const browserTabsGetMock = vi.hoisted(() => vi.fn());
const runtimeInfoGetManifestMock = vi.hoisted(() => vi.fn());
import {
  handleExportHarForcedDetach,
  startExportHarSession as startOwnerExportHarSession,
  stopExportHarSession as stopOwnerExportHarSession,
} from './session';
import { issueExportHarStartCapability } from './start-capability';
import { handleExportHarDebuggerEvent } from './debugger-events';
const attachDebugger = vi.hoisted(() => vi.fn());
const detachDebugger = vi.hoisted(() => vi.fn());
const getTabIdByTargetId = vi.hoisted(() => vi.fn());
const harCapabilityTokens = new Map<string, string>();

vi.mock('../../debugger/session/attach', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../debugger/session/attach')>()),
  attachDebugger,
}));
vi.mock('../../debugger/session/detach', () => ({
  detachDebugger,
}));
vi.mock('../../debugger/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../debugger/session')>()),
  getTabIdByTargetId,
}));
vi.mock('@sniptale/platform/browser/debugger', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sniptale/platform/browser/debugger')>();
  return {
    ...original,
    browserDebugger: { ...original.browserDebugger, sendCommand: browserDebuggerSendCommandMock },
  };
});

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: {
    get: browserTabsGetMock,
  },
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sniptale/platform/browser/runtime')>();
  return {
    ...original,
    runtimeInfo: { ...original.runtimeInfo, getManifest: runtimeInfoGetManifestMock },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  harCapabilityTokens.clear();
  attachDebugger.mockResolvedValue('target-1');
  browserDebuggerSendCommandMock.mockResolvedValue(undefined);
  browserDebuggerSendCommandMock
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce({ product: 'Chrome/123.0.0.0' });
  browserTabsGetMock.mockResolvedValue({ url: 'https://example.test/page' });
  detachDebugger.mockResolvedValue(undefined);
  getTabIdByTargetId.mockReturnValue(undefined);
  runtimeInfoGetManifestMock.mockReturnValue({ version: '0.4.0' });
});

async function startExportHarSession(
  sessionId: string,
  tabId: number,
  rawDiagnosticsEnabled = false
) {
  const senderUrl = 'chrome-extension://sniptale/content.js';
  const startCapability = issueExportHarStartCapability({
    rawDiagnosticsEnabled,
    senderUrl,
    sessionId,
    tabId,
  });
  const result = await startOwnerExportHarSession(sessionId, tabId, startCapability, senderUrl);
  harCapabilityTokens.set(sessionId, result.capabilityToken);
  return result;
}

async function stopExportHarSession(sessionId: string, tabId: number) {
  return stopOwnerExportHarSession(sessionId, tabId, harCapabilityTokens.get(sessionId) ?? '');
}

async function collectCompletedHar() {
  await startExportHarSession('session-1', 7);

  handleExportHarDebuggerEvent({ tabId: 7 }, 'Network.requestWillBeSent', {
    requestId: 'request-1',
    request: {
      headers: { Authorization: 'secret', Accept: 'application/json' },
      method: 'GET',
      url: 'https://example.test/api/items?q=1',
    },
    type: 'Fetch',
  });
  handleExportHarDebuggerEvent({ tabId: 7 }, 'Network.responseReceived', {
    requestId: 'request-1',
    response: {
      headers: { 'set-cookie': 'secret', 'content-type': 'application/json' },
      mimeType: 'application/json',
      protocol: 'h2',
      status: 200,
      statusText: 'OK',
    },
  });
  handleExportHarDebuggerEvent({ tabId: 7 }, 'Network.loadingFinished', {
    encodedDataLength: 321,
    requestId: 'request-1',
  });

  return (await stopExportHarSession('session-1', 7)).har;
}

describe('export HAR completed lifecycle', () => {
  it('captures a basic HAR lifecycle from request to loadingFinished', async () => {
    const har = await collectCompletedHar();
    const [entry] = har.log.entries;
    if (!entry) {
      throw new Error('Expected a HAR entry to be recorded');
    }

    expect(har.log.entries).toHaveLength(1);
    expect(har.log.browser).toEqual({
      name: 'Chrome',
      version: '123.0.0.0',
    });
    expect(entry.request.headers).toContainEqual({
      name: 'Authorization',
      value: '[redacted]',
    });
    expect(entry.response.headers).toContainEqual({
      name: 'set-cookie',
      value: '[redacted]',
    });
    expect(detachDebugger).toHaveBeenCalledWith(7, 'export-har');
  });

  it('stores sanitized tab URLs in HAR sessions', async () => {
    browserTabsGetMock.mockResolvedValue({
      url: 'https://example.test/page?access_token=session-secret#frag',
    });

    await startExportHarSession('session-sanitized-page-url', 23);
    const { har } = await stopExportHarSession('session-sanitized-page-url', 23);

    expect(har.log.pages[0]?.title).toBe('https://example.test/page');
    expect(JSON.stringify(har)).not.toContain('session-secret');
  });
});

describe('export HAR target resolution lifecycle', () => {
  it('resolves sessions from target ids and finalizes loading failures with fallback metadata', async () => {
    getTabIdByTargetId.mockReturnValue(19);

    await startExportHarSession('session-target-id', 19);

    handleExportHarDebuggerEvent({ targetId: 'target-19' }, 'Network.requestWillBeSent', {
      requestId: 'request-2',
      request: {
        headers: {},
        method: 'POST',
        url: 'https://example.test/api/upload',
      },
      type: 'XHR',
    });
    handleExportHarDebuggerEvent({ targetId: 'target-19' }, 'Network.responseReceived', {
      requestId: 'request-2',
      response: {
        headers: {},
        mimeType: '',
        status: 500,
        statusText: 'Server Error',
      },
    });
    handleExportHarDebuggerEvent({ targetId: 'target-19' }, 'Network.loadingFailed', {
      requestId: 'request-2',
    });

    const { har } = await stopExportHarSession('session-target-id', 19);
    const [entry] = har.log.entries;
    if (!entry) {
      throw new Error('Expected a HAR entry to be recorded');
    }

    expect(har.log.entries).toHaveLength(1);
    expect(entry.response.httpVersion).toBe('HTTP/1.1');
    expect(entry.response.content.mimeType).toBe('');
    expect(entry.response.status).toBe(500);
  });
});

describe('export HAR shutdown warnings', () => {
  it('warns but still detaches when Network.disable fails during shutdown', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    browserDebuggerSendCommandMock.mockReset();
    browserDebuggerSendCommandMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ product: 'Chrome/123.0.0.0' })
      .mockRejectedValueOnce(new Error('disable failed'));

    await startExportHarSession('session-disable-failure', 17);
    await expect(stopExportHarSession('session-disable-failure', 17)).resolves.toEqual(
      expect.objectContaining({
        har: expect.objectContaining({
          log: expect.objectContaining({
            entries: [],
          }),
        }),
        rawDiagnosticsEnabled: false,
      })
    );

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[ExportHAR]',
      'Failed to disable Network domain',
      expect.any(Error)
    );
    expect(detachDebugger).toHaveBeenCalledWith(17, 'export-har');
  });
});

describe('export HAR attach failures', () => {
  it('returns a conflict error when debugger attach is unavailable', async () => {
    attachDebugger.mockRejectedValue(new Error('Another client is already attached'));

    await expect(startExportHarSession('session-2', 9)).rejects.toThrow(
      'HAR collection is unavailable'
    );
  });

  it('detaches the debugger when Network.enable fails after a successful attach', async () => {
    browserDebuggerSendCommandMock.mockReset();
    browserDebuggerSendCommandMock.mockRejectedValue(new Error('enable failed'));

    await expect(startExportHarSession('session-enable-failure', 15)).rejects.toThrow(
      'enable failed'
    );

    expect(detachDebugger).toHaveBeenCalledWith(15, 'export-har');
  });

  it('rejects duplicate HAR sessions for the same tab before attaching again', async () => {
    const handle = await startExportHarSession('session-a', 21);

    await expect(startExportHarSession('session-b', 21)).rejects.toThrow(
      'already active for tab 21'
    );
    expect(attachDebugger).toHaveBeenCalledTimes(1);

    await stopOwnerExportHarSession('session-a', 21, handle.capabilityToken);
  });
});

describe('export HAR forced detach cleanup', () => {
  it('drops session state on forced detach', async () => {
    await startExportHarSession('session-3', 11);
    handleExportHarForcedDetach(11);

    await expect(stopExportHarSession('session-3', 11)).rejects.toThrow('was not found');
  });
});

describe('export HAR boundary guards', () => {
  it('ignores invalid debugger payloads without crashing the session', async () => {
    await startExportHarSession('session-4', 13);

    handleExportHarDebuggerEvent({ tabId: 13 }, 'Network.requestWillBeSent', {
      requestId: 123,
    });
    handleExportHarDebuggerEvent({ tabId: 13 }, 'Network.responseReceived', {
      requestId: 'request-1',
      response: {
        status: '200',
      },
    });
    handleExportHarDebuggerEvent({ tabId: 13 }, 'Network.loadingFinished', {
      requestId: null,
    });

    const { har } = await stopExportHarSession('session-4', 13);

    expect(har.log.entries).toHaveLength(0);
  });

  it('ignores events for debugger sources that do not resolve to a tracked session', async () => {
    getTabIdByTargetId.mockReturnValue(undefined);

    expect(() =>
      handleExportHarDebuggerEvent({ targetId: 'unknown-target' }, 'Network.loadingFailed', {
        requestId: 'request-404',
      })
    ).not.toThrow();
  });
});
