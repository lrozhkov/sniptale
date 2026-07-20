import { beforeEach, expect, it, vi } from 'vitest';

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

import {
  handleExportHarNavigationStart,
  startExportHarSession,
  stopExportHarSession,
} from './session';
import { issueExportHarStartCapability } from './start-capability';

const senderUrl = 'chrome-extension://sniptale/content.js';

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

async function startSession(sessionId: string, tabId: number) {
  const capabilityToken = issueExportHarStartCapability({
    senderUrl,
    sessionId,
    tabId,
  });
  return startExportHarSession(sessionId, tabId, capabilityToken, senderUrl);
}

it('detaches and clears active HAR sessions on top-level navigation', async () => {
  const handle = await startSession('session-navigation', 41);
  vi.clearAllMocks();
  browserDebuggerSendCommandMock.mockResolvedValue(undefined);

  await handleExportHarNavigationStart(41);

  expect(browserDebuggerSendCommandMock).toHaveBeenCalledWith({ tabId: 41 }, 'Network.disable');
  expect(detachDebugger).toHaveBeenCalledWith(41, 'export-har');
  await expect(
    stopExportHarSession('session-navigation', 41, handle.capabilityToken)
  ).rejects.toThrow('HAR session "session-navigation" was not found.');
});

it('ignores navigation for tabs without active HAR sessions', async () => {
  await expect(handleExportHarNavigationStart(42)).resolves.toBeUndefined();

  expect(browserDebuggerSendCommandMock).not.toHaveBeenCalled();
  expect(detachDebugger).not.toHaveBeenCalled();
});
