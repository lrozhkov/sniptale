// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const browserDebuggerSendCommandMock = vi.hoisted(() => vi.fn());
const browserTabsGetMock = vi.hoisted(() => vi.fn());
const runtimeInfoGetManifestMock = vi.hoisted(() => vi.fn());
const attachDebugger = vi.hoisted(() => vi.fn());
const detachDebugger = vi.hoisted(() => vi.fn());

vi.mock('../../debugger/session/attach', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../debugger/session/attach')>()),
  attachDebugger,
}));

vi.mock('../../debugger/session/detach', () => ({
  detachDebugger,
}));

vi.mock('@sniptale/platform/browser/debugger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/debugger')>()),
  browserDebugger: {
    sendCommand: browserDebuggerSendCommandMock,
  },
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: {
    get: browserTabsGetMock,
  },
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getManifest: runtimeInfoGetManifestMock,
  },
}));

import { handleExportHarDebuggerEvent } from './debugger-events';
import {
  startExportHarSession,
  stopExportHarSession as stopOwnerExportHarSession,
} from './session';
import { issueExportHarStartCapability } from './start-capability';

function dispatchRawRequest(tabId: number): void {
  handleExportHarDebuggerEvent({ tabId }, 'Network.requestWillBeSent', {
    requestId: 'request-raw',
    request: {
      headers: {
        Accept: 'application/json',
        Authorization: 'known-secret',
        Cookie: 'session=known-secret',
      },
      method: 'GET',
      url: [
        'https://example.test/api?token=known-secret',
        'password=known-secret',
        'passphrase=known-secret',
        'session_id=known-secret',
        'otp=known-secret',
        'q=public#frag',
      ].join('&'),
    },
  });
}

function expectRawHarResultRedacted(result: Awaited<ReturnType<typeof stopOwnerExportHarSession>>) {
  const [entry] = result.har.log.entries;

  expect(result.rawDiagnosticsEnabled).toBe(true);
  expect(result.har.log.pages[0]?.title).toBe('https://example.test/page?token=***&q=public');
  expect(entry?.request.url).toBe(
    [
      'https://example.test/api?token=***',
      'password=***',
      'passphrase=***',
      'session_id=***',
      'otp=***',
      'q=public',
    ].join('&')
  );
  expect(entry?.request.headers).toContainEqual({
    name: 'Authorization',
    value: '[redacted]',
  });
  expect(entry?.request.headers).toContainEqual({ name: 'Cookie', value: '[redacted]' });
  expect(JSON.stringify(result.har)).not.toContain('known-secret');
  expect(JSON.stringify(result.har)).not.toContain('#frag');
}

beforeEach(() => {
  vi.clearAllMocks();
  attachDebugger.mockResolvedValue('target-29');
  browserDebuggerSendCommandMock.mockResolvedValue(undefined);
  browserDebuggerSendCommandMock
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce({ product: 'Chrome/123.0.0.0' });
  browserTabsGetMock.mockResolvedValue({
    url: 'https://example.test/page?token=known-secret&q=public#frag',
  });
  detachDebugger.mockResolvedValue(undefined);
  runtimeInfoGetManifestMock.mockReturnValue({ version: '0.4.0' });
});

describe('export HAR raw diagnostics mode', () => {
  it('returns raw diagnostics authority with the captured payload', async () => {
    const senderUrl = 'chrome-extension://sniptale/content.js';
    const startCapability = issueExportHarStartCapability({
      rawDiagnosticsEnabled: true,
      senderUrl,
      sessionId: 'session-raw',
      tabId: 29,
    });
    const handle = await startExportHarSession('session-raw', 29, startCapability, senderUrl);
    dispatchRawRequest(29);

    const result = await stopOwnerExportHarSession('session-raw', 29, handle.capabilityToken);
    expectRawHarResultRedacted(result);
  });
});
