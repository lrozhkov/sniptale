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

vi.mock('@sniptale/platform/browser/debugger', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sniptale/platform/browser/debugger')>();
  return {
    ...original,
    browserDebugger: { ...original.browserDebugger, sendCommand: browserDebuggerSendCommandMock },
  };
});

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { get: browserTabsGetMock },
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sniptale/platform/browser/runtime')>();
  return {
    ...original,
    runtimeInfo: { ...original.runtimeInfo, getManifest: runtimeInfoGetManifestMock },
  };
});

import { startExportHarSession, stopExportHarSession } from './session';
import { issueExportHarStartCapability } from './start-capability';

beforeEach(() => {
  vi.clearAllMocks();
  attachDebugger.mockResolvedValue('target-1');
  browserDebuggerSendCommandMock
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce({ product: 'Chrome/123.0.0.0' });
  browserTabsGetMock.mockResolvedValue({ url: 'https://example.test/page' });
  detachDebugger.mockResolvedValue(undefined);
  runtimeInfoGetManifestMock.mockReturnValue({ version: '0.4.0' });
});

afterEach(() => {
  vi.useRealTimers();
});

async function startSession(sessionId: string, tabId: number) {
  const capabilityToken = issueExportHarStartCapability({
    senderUrl: 'chrome-extension://sniptale/content.js',
    sessionId,
    tabId,
  });
  const result = await startExportHarSession(
    sessionId,
    tabId,
    capabilityToken,
    'chrome-extension://sniptale/content.js'
  );
  vi.clearAllMocks();
  browserDebuggerSendCommandMock.mockResolvedValue(undefined);
  return result;
}

it('rejects HAR stop from a different tab before debugger side effects', async () => {
  const handle = await startSession('session-tab-a', 7);

  await expect(stopExportHarSession('session-tab-a', 8, handle.capabilityToken)).rejects.toThrow(
    'HAR session "session-tab-a" is not active for tab 8.'
  );

  expect(browserDebuggerSendCommandMock).not.toHaveBeenCalled();
  expect(detachDebugger).not.toHaveBeenCalled();

  await stopExportHarSession('session-tab-a', 7, handle.capabilityToken);
});

it('allows same-tab stop once and rejects replay stops', async () => {
  const handle = await startSession('session-owned', 9);

  await expect(stopExportHarSession('session-owned', 9, handle.capabilityToken)).resolves.toEqual(
    expect.objectContaining({ rawDiagnosticsEnabled: false })
  );
  expect(browserDebuggerSendCommandMock).toHaveBeenCalledWith({ tabId: 9 }, 'Network.disable');
  expect(detachDebugger).toHaveBeenCalledWith(9, 'export-har');

  vi.clearAllMocks();
  await expect(stopExportHarSession('session-owned', 9, handle.capabilityToken)).rejects.toThrow(
    'HAR session "session-owned" was not found.'
  );
  expect(browserDebuggerSendCommandMock).not.toHaveBeenCalled();
  expect(detachDebugger).not.toHaveBeenCalled();
});

it('cleans up expired HAR sessions without waiting for stop', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

  await startSession('session-ttl-cleanup', 14);
  vi.setSystemTime(new Date('2026-01-01T00:10:00.000Z'));
  await vi.runOnlyPendingTimersAsync();

  expect(browserDebuggerSendCommandMock).toHaveBeenCalledWith({ tabId: 14 }, 'Network.disable');
  expect(detachDebugger).toHaveBeenCalledWith(14, 'export-har');

  vi.clearAllMocks();
  await expect(stopExportHarSession('session-ttl-cleanup', 14, 'stale-token')).rejects.toThrow(
    'HAR session "session-ttl-cleanup" was not found.'
  );
  expect(browserDebuggerSendCommandMock).not.toHaveBeenCalled();
  expect(detachDebugger).not.toHaveBeenCalled();
});

it('cancels expiry cleanup after normal HAR stop', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  const handle = await startSession('session-normal-stop', 15);

  await stopExportHarSession('session-normal-stop', 15, handle.capabilityToken);
  vi.clearAllMocks();
  vi.setSystemTime(new Date('2026-01-01T00:10:00.000Z'));
  await vi.runOnlyPendingTimersAsync();

  expect(browserDebuggerSendCommandMock).not.toHaveBeenCalled();
  expect(detachDebugger).not.toHaveBeenCalled();
});

it('rejects HAR stop with an invalid capability before debugger side effects', async () => {
  const handle = await startSession('session-token', 10);

  await expect(stopExportHarSession('session-token', 10, 'wrong-token')).rejects.toThrow(
    'HAR session "session-token" rejected an invalid capability token.'
  );

  expect(browserDebuggerSendCommandMock).not.toHaveBeenCalled();
  expect(detachDebugger).not.toHaveBeenCalled();

  await stopExportHarSession('session-token', 10, handle.capabilityToken);
});

it('detaches expired HAR sessions before rejecting owner stop', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  const handle = await startSession('session-expired', 12);
  vi.setSystemTime(new Date('2026-01-01T00:11:00.000Z'));

  await expect(stopExportHarSession('session-expired', 12, handle.capabilityToken)).rejects.toThrow(
    'HAR session "session-expired" expired.'
  );

  expect(browserDebuggerSendCommandMock).toHaveBeenCalledWith({ tabId: 12 }, 'Network.disable');
  expect(detachDebugger).toHaveBeenCalledWith(12, 'export-har');

  vi.clearAllMocks();
  await expect(stopExportHarSession('session-expired', 12, handle.capabilityToken)).rejects.toThrow(
    'HAR session "session-expired" was not found.'
  );
  expect(browserDebuggerSendCommandMock).not.toHaveBeenCalled();
  expect(detachDebugger).not.toHaveBeenCalled();
});
