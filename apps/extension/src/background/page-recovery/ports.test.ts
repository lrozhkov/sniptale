import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRuntimePortFixture } from '../../../../../tooling/test/support/chrome-runtime-port';
import { PAGE_RECOVERY_CONTENT_PORT } from '../../contracts/page-recovery';
import { pageRecoverySource, registerPageRecoveryPorts } from './ports';
const mocks = vi.hoisted(() => ({
  connectListener: null as ((port: chrome.runtime.Port) => void) | null,
  request: vi.fn(),
  disconnect: vi.fn(),
  connect: vi.fn(),
  maintenance: vi.fn(),
  navigate: vi.fn(),
  forgetTab: vi.fn(),
  committed: vi.fn(),
  removed: vi.fn(),
}));
vi.mock('@sniptale/platform/browser/runtime', () => ({
  browserRuntime: {
    getURL: (path: string) => `chrome-extension://extension/${path}`,
    subscribeToConnections: (listener: (port: chrome.runtime.Port) => void) => {
      mocks.connectListener = listener;
      return vi.fn();
    },
  },
}));
vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { subscribeToRemoved: mocks.removed },
}));
vi.mock('@sniptale/platform/browser/web-navigation', () => ({
  browserWebNavigation: { subscribeToCommitted: mocks.committed },
}));
vi.mock('./service', () => ({
  pageRecoveryService: {
    connect: mocks.connect,
    maintenance: mocks.maintenance,
    navigate: mocks.navigate,
    forgetTab: mocks.forgetTab,
  },
}));
const sender = {
  id: 'extension',
  frameId: 0,
  documentId: 'document',
  documentLifecycle: 'active',
  tab: { id: 1 },
  url: 'https://example.test/page',
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('chrome', {
    alarms: {
      clear: vi.fn().mockResolvedValue(true),
      create: vi.fn().mockResolvedValue(undefined),
      onAlarm: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  });
  mocks.connect.mockReturnValue({ request: mocks.request, disconnect: mocks.disconnect });
  mocks.maintenance.mockResolvedValue(null);
  mocks.forgetTab.mockResolvedValue(undefined);
  mocks.committed.mockReturnValue(vi.fn());
  mocks.removed.mockReturnValue(vi.fn());
});
afterEach(() => vi.unstubAllGlobals());
it('refuses foreign frames extensions lifecycle states and non-web documents before service access', () => {
  registerPageRecoveryPorts();
  for (const value of [
    undefined,
    { ...sender, id: 'foreign' },
    { ...sender, frameId: 1 },
    { ...sender, documentId: undefined },
    { ...sender, documentLifecycle: 'cached' },
    { ...sender, tab: undefined },
    { ...sender, url: 'chrome-extension://extension/page.html' },
    { ...sender, url: 'file:///private' },
    { ...sender, url: 'javascript:alert(1)' },
  ]) {
    const port = createRuntimePortFixture({
      name: PAGE_RECOVERY_CONTENT_PORT,
      ...(value ? { sender: value as chrome.runtime.MessageSender } : {}),
    });
    mocks.connectListener!(port.port);
    expect(port.disconnect).toHaveBeenCalledOnce();
  }
  expect(mocks.connect).not.toHaveBeenCalled();
  expect(pageRecoverySource(sender as chrome.runtime.MessageSender)).toEqual({
    tabId: 1,
    documentId: 'document',
    pageUrl: sender.url,
  });
});
it('routes only bounded native sender commands and disconnects malformed input', async () => {
  const stop = registerPageRecoveryPorts();
  const port = createRuntimePortFixture({
    name: PAGE_RECOVERY_CONTENT_PORT,
    sender: sender as chrome.runtime.MessageSender,
  });
  mocks.connectListener!(port.port);
  const requestId = crypto.randomUUID();
  const lease = crypto.randomUUID();
  const reply = { kind: 'result', requestId, status: 'ready', lease, available: true };
  mocks.request.mockResolvedValue(reply);
  port.onMessage.emit({ kind: 'peek', requestId });
  await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalledWith(reply));
  expect(mocks.connect).toHaveBeenCalledWith(
    { tabId: 1, documentId: 'document', pageUrl: sender.url },
    expect.any(Function)
  );
  port.onMessage.emit({ kind: 'peek', requestId, tabId: 2 });
  expect(mocks.disconnect).toHaveBeenCalledOnce();
  port.onDisconnect.emit(port.port);
  stop();
});
it('binds native navigation and removal and schedules expiry independently of producer activity', async () => {
  const stop = registerPageRecoveryPorts();
  await vi.waitFor(() =>
    expect(chrome.alarms.clear).toHaveBeenCalledWith('sniptale-page-recovery-expiry')
  );
  const committed = mocks.committed.mock.calls[0]![0];
  committed({ frameId: 1, tabId: 1, documentId: 'child' });
  expect(mocks.navigate).not.toHaveBeenCalled();
  committed({ frameId: 0, tabId: 1, documentId: 'next' });
  expect(mocks.navigate).toHaveBeenCalledWith(1, 'next');
  mocks.removed.mock.calls[0]![0](1);
  expect(mocks.forgetTab).toHaveBeenCalledWith(1);
  mocks.maintenance.mockResolvedValueOnce(45_000);
  vi.mocked(chrome.alarms.onAlarm.addListener).mock.calls[0]![0]({
    name: 'sniptale-page-recovery-expiry',
    scheduledTime: 45_000,
    persistAcrossSessions: true,
  });
  await vi.waitFor(() =>
    expect(chrome.alarms.create).toHaveBeenCalledWith('sniptale-page-recovery-expiry', {
      when: 45_000,
    })
  );
  stop();
  expect(chrome.alarms.onAlarm.removeListener).toHaveBeenCalledOnce();
});
