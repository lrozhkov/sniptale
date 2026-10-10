import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRuntimePortFixture } from '../../../../../../tooling/test/support/chrome-runtime-port';
import { registerReviewTextPorts } from './review-text-port';
import { createReviewTextJobService } from './review-text-job';
import { REVIEW_TEXT_PORT_NAME } from '../../../contracts/ai/review-text';

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
  url: 'chrome-extension://extension/apps/extension/src/gallery/index.html',
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('chrome', {
    runtime: { id: 'extension', getURL: (path: string) => `chrome-extension://extension/${path}` },
  });
});
afterEach(() => vi.unstubAllGlobals());
it('refuses other extension pages, content frames and missing identities before service access', () => {
  const service = createReviewTextJobService();
  const connect = vi.spyOn(service, 'connect');
  registerReviewTextPorts(service);
  for (const identity of [
    { ...sender, id: 'other' },
    { ...sender, frameId: 1 },
    { ...sender, url: 'https://provider.test' },
    { id: sender.id, frameId: 0, url: sender.url },
  ]) {
    const port = createRuntimePortFixture({ name: REVIEW_TEXT_PORT_NAME, sender: identity });
    browser.listener?.(port.port);
    expect(port.disconnect).toHaveBeenCalledOnce();
  }
  const other = createRuntimePortFixture({ name: 'other', sender });
  browser.listener?.(other.port);
  expect(other.disconnect).not.toHaveBeenCalled();
  expect(connect).not.toHaveBeenCalled();
});
it('strictly parses commands and disconnects malformed traffic, removing listeners no a lat...', async () => {
  const service = createReviewTextJobService();
  const connection = { receive: vi.fn(), disconnect: vi.fn(async () => undefined) };
  vi.spyOn(service, 'connect').mockReturnValue(connection);
  const stop = registerReviewTextPorts(service);
  const port = createRuntimePortFixture({ name: REVIEW_TEXT_PORT_NAME, sender });
  browser.listener?.(port.port);
  const command = { type: 'cancel', requestId: '1cbf949a-76e3-41e2-a37a-78179423eb29' };
  port.onMessage.emit(command);
  expect(connection.receive).toHaveBeenCalledExactlyOnceWith(command);
  port.onMessage.emit({ ...command, privatePayload: 'bad' });
  expect(port.disconnect).toHaveBeenCalledOnce();
  port.onDisconnect.emit(port.port);
  port.onMessage.emit(command);
  expect(connection.receive).toHaveBeenCalledOnce();
  await Promise.resolve();
  expect(connection.disconnect).toHaveBeenCalledTimes(2);
  stop();
  expect(browser.unsubscribe).toHaveBeenCalledOnce();
});
