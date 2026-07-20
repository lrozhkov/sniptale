// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const browserDebuggerSendCommandMock = vi.hoisted(() => vi.fn());
const browserTabsGetMock = vi.hoisted(() => vi.fn());
const runtimeInfoGetManifestMock = vi.hoisted(() => vi.fn());
const attachDebugger = vi.hoisted(() => vi.fn());
const detachDebugger = vi.hoisted(() => vi.fn());

vi.mock('../../debugger/session/attach', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../debugger/session/attach')>()),
  attachDebugger,
}));

vi.mock('../../debugger/session/detach', () => ({ detachDebugger }));

vi.mock('@sniptale/platform/browser/debugger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/debugger')>()),
  browserDebugger: { sendCommand: browserDebuggerSendCommandMock },
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { get: browserTabsGetMock },
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: { getManifest: runtimeInfoGetManifestMock },
}));

import { handleExportHarDebuggerEvent } from './debugger-events';
import { startExportHarSession, stopExportHarSession } from './session';
import { issueExportHarStartCapability } from './start-capability';

const senderUrl = 'chrome-extension://sniptale/content.js';

beforeEach(() => {
  vi.clearAllMocks();
  attachDebugger.mockResolvedValue('target-raw-reset');
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

afterEach(() => {
  vi.useRealTimers();
});

function issueStart(sessionId: string, tabId: number, rawDiagnosticsEnabled = false): string {
  return issueExportHarStartCapability({
    rawDiagnosticsEnabled,
    senderUrl,
    sessionId,
    tabId,
  });
}

async function startSession(sessionId: string, tabId: number, rawDiagnosticsEnabled = false) {
  return startExportHarSession(
    sessionId,
    tabId,
    issueStart(sessionId, tabId, rawDiagnosticsEnabled),
    senderUrl
  );
}

function dispatchRequest(tabId: number): void {
  handleExportHarDebuggerEvent({ tabId }, 'Network.requestWillBeSent', {
    requestId: 'request-raw-reset',
    request: {
      headers: { Authorization: 'known-secret', Cookie: 'session=known-secret' },
      method: 'GET',
      url: 'https://example.test/api?token=known-secret&q=public#frag',
    },
  });
}

function resetStartMocks(targetId: string): void {
  vi.clearAllMocks();
  attachDebugger.mockResolvedValue(targetId);
  browserDebuggerSendCommandMock.mockResolvedValue(undefined);
}

async function collectNextSanitizedSession(sessionId: string, tabId: number) {
  const handle = await startSession(sessionId, tabId);
  dispatchRequest(tabId);
  return stopExportHarSession(sessionId, tabId, handle.capabilityToken);
}

function expectSanitizedAfterRawReset(
  result: Awaited<ReturnType<typeof stopExportHarSession>>
): void {
  const [entry] = result.har.log.entries;

  expect(result.rawDiagnosticsEnabled).toBe(false);
  expect(result.har.log.pages[0]?.title).toBe('https://example.test/page');
  expect(entry?.request.url).toBe('https://example.test/api');
  expect(entry?.request.queryString).toContainEqual({ name: 'q', value: '[redacted]' });
  expect(JSON.stringify(result.har)).not.toContain('public');
  expect(JSON.stringify(result.har)).not.toContain('known-secret');
}

it('resets raw diagnostics mode after export before the next session starts', async () => {
  const rawHandle = await startSession('session-raw-reset', 31, true);
  await stopExportHarSession('session-raw-reset', 31, rawHandle.capabilityToken);
  resetStartMocks('target-31-next');

  const result = await collectNextSanitizedSession('session-sanitized-after-raw', 31);

  expectSanitizedAfterRawReset(result);
});

it('resets raw diagnostics mode after TTL cleanup before the next session starts', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
  await startSession('session-raw-timeout', 33, true);
  resetStartMocks('target-33-next');
  vi.setSystemTime(new Date('2026-06-15T12:11:00.000Z'));
  await vi.runOnlyPendingTimersAsync();

  expect(browserDebuggerSendCommandMock).toHaveBeenCalledWith({ tabId: 33 }, 'Network.disable');
  expect(detachDebugger).toHaveBeenCalledWith(33, 'export-har');
  resetStartMocks('target-33-next');
  const result = await collectNextSanitizedSession('session-sanitized-after-timeout', 33);

  expectSanitizedAfterRawReset(result);
});
