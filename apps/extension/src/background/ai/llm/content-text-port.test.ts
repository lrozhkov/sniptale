import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRuntimePortFixture } from '../../../../../../tooling/test/support/chrome-runtime-port';
import { registerContentTextPorts } from './content-text-port';
import { createContentTextJobService } from './content-text-job';
import { CONTENT_TEXT_PORT_NAME } from '../../../contracts/ai/content-text';

const browser = vi.hoisted(() => ({
  listener: null as ((port: chrome.runtime.Port) => void) | null,
  unsubscribe: vi.fn(),
}));
vi.mock('@sniptale/platform/browser/runtime', async (original) => ({
  ...(await original<typeof import('@sniptale/platform/browser/runtime')>()),
  browserRuntime: {
    subscribeToConnections(listener: (port: chrome.runtime.Port) => void) {
      browser.listener = listener;
      return browser.unsubscribe;
    },
  },
}));
const sender = {
  id: 'extension',
  documentId: 'document',
  frameId: 0,
  tab: { id: 7 } as chrome.tabs.Tab,
  url: 'https://page.test/path',
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('chrome', {
    runtime: { id: 'extension', getURL: (path: string) => `chrome-extension://extension/${path}` },
  });
});
afterEach(() => vi.unstubAllGlobals());
it('rejects unowned senders before creating a job', () => {
  const service = createContentTextJobService();
  const connect = vi.spyOn(service, 'connect');
  registerContentTextPorts(service);
  const missingDocument: chrome.runtime.MessageSender = { ...sender };
  delete missingDocument.documentId;
  const missingTab: chrome.runtime.MessageSender = { ...sender };
  delete missingTab.tab;
  for (const identity of [
    { ...sender, id: 'other' },
    { ...sender, frameId: -1 },
    { ...sender, url: 'file:///page.html' },
    missingDocument,
    missingTab,
  ]) {
    const port = createRuntimePortFixture({ name: CONTENT_TEXT_PORT_NAME, sender: identity });
    browser.listener?.(port.port);
    expect(port.disconnect).toHaveBeenCalledOnce();
  }
  const other = createRuntimePortFixture({ name: 'other', sender });
  browser.listener?.(other.port);
  expect(other.disconnect).not.toHaveBeenCalled();
  expect(connect).not.toHaveBeenCalled();
});
it('disconnects malformed commands and removes listeners so later messages cannot resume work', async () => {
  const service = createContentTextJobService();
  const connection = { receive: vi.fn(), disconnect: vi.fn(async () => undefined) };
  vi.spyOn(service, 'connect').mockReturnValue(connection);
  const stop = registerContentTextPorts(service);
  const port = createRuntimePortFixture({ name: CONTENT_TEXT_PORT_NAME, sender });
  browser.listener?.(port.port);
  const command = { type: 'cancel', requestId: '1cbf949a-76e3-41e2-a37a-78179423eb29' };
  port.onMessage.emit(command);
  expect(connection.receive).toHaveBeenCalledExactlyOnceWith(command);
  port.onMessage.emit({ ...command, sourceHtml: '<p>Forbidden</p>' });
  expect(port.disconnect).toHaveBeenCalledOnce();
  port.onDisconnect.emit(port.port);
  port.onMessage.emit(command);
  expect(connection.receive).toHaveBeenCalledOnce();
  await Promise.resolve();
  expect(connection.disconnect).toHaveBeenCalledTimes(2);
  stop();
  expect(browser.unsubscribe).toHaveBeenCalledOnce();
});
it('admits the existing saved-page viewer without admitting other extension pages', () => {
  const service = createContentTextJobService();
  const connection = { receive: vi.fn(), disconnect: vi.fn(async () => undefined) };
  const connect = vi.spyOn(service, 'connect').mockReturnValue(connection);
  registerContentTextPorts(service);
  for (const page of ['web-snapshot-viewer', 'settings']) {
    const identity = {
      ...sender,
      url: `chrome-extension://extension/apps/extension/src/${page}/index.html`,
    };
    const port = createRuntimePortFixture({ name: CONTENT_TEXT_PORT_NAME, sender: identity });
    browser.listener?.(port.port);
    if (page === 'settings') expect(port.disconnect).toHaveBeenCalledOnce();
    else expect(port.disconnect).not.toHaveBeenCalled();
  }
  expect(connect).toHaveBeenCalledOnce();
});
