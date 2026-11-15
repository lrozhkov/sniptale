import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRuntimePortFixture } from '../../../../../../tooling/test/support/chrome-runtime-port';
import { registerImageJobPort } from './port';
import { createImageJobService } from './service';
import { IMAGE_JOB_PORT_NAME } from '../../../contracts/ai/image';

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
  url: 'chrome-extension://extension/apps/extension/src/editor/index.html',
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('chrome', {
    runtime: { id: 'extension', getURL: (path: string) => `chrome-extension://extension/${path}` },
  });
});
afterEach(() => vi.unstubAllGlobals());
it('refuses foreign extension pages and missing editor identities before service access', () => {
  const service = createImageJobService();
  const connect = vi.spyOn(service, 'connect');
  registerImageJobPort(service);
  for (const identity of [
    { ...sender, id: 'other' },
    { ...sender, url: sender.url.replace('/editor/', '/gallery/') },
    { ...sender, url: 'https://provider.test' },
    { id: sender.id, frameId: 0, url: sender.url },
  ]) {
    const port = createRuntimePortFixture({ name: IMAGE_JOB_PORT_NAME, sender: identity });
    browser.listener?.(port.port);
    expect(port.disconnect).toHaveBeenCalledOnce();
  }
  const other = createRuntimePortFixture({ name: 'other', sender });
  browser.listener?.(other.port);
  expect(other.disconnect).not.toHaveBeenCalled();
  expect(connect).not.toHaveBeenCalled();
});
it('disconnects malformed traffic and removes command listeners', async () => {
  const service = createImageJobService();
  const connection = { receive: vi.fn(), disconnect: vi.fn(async () => undefined) };
  vi.spyOn(service, 'connect').mockReturnValue(connection);
  const stop = registerImageJobPort(service);
  const port = createRuntimePortFixture({ name: IMAGE_JOB_PORT_NAME, sender });
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
it.each([0, 2])('admits an owned editor document in frame %s', (frameId) => {
  const service = createImageJobService();
  const connection = { receive: vi.fn(), disconnect: vi.fn(async () => undefined) };
  const connect = vi.spyOn(service, 'connect').mockReturnValue(connection);
  registerImageJobPort(service);
  const port = createRuntimePortFixture({
    name: IMAGE_JOB_PORT_NAME,
    sender: { ...sender, frameId },
  });
  browser.listener?.(port.port);
  expect(connect).toHaveBeenCalledOnce();
  expect(port.disconnect).not.toHaveBeenCalled();
});

it('cancels the image connection when sending fails and detaches its listeners on disconnect', async () => {
  const service = createImageJobService();
  const connection = { receive: vi.fn(), disconnect: vi.fn(async () => undefined) };
  const connect = vi.spyOn(service, 'connect').mockReturnValue(connection);
  registerImageJobPort(service);
  const port = createRuntimePortFixture({ name: IMAGE_JOB_PORT_NAME, sender });
  browser.listener?.(port.port);
  port.postMessage.mockImplementationOnce(() => {
    throw new Error('disconnected');
  });
  connect.mock.calls[0]?.[1]({
    type: 'progress',
    requestId: 'request',
    phase: 'authorizing',
    variant: 0,
  });
  await Promise.resolve();
  expect(connection.disconnect).toHaveBeenCalledOnce();
  port.onDisconnect.emit(port.port);
  port.onMessage.emit({ type: 'cancel', requestId: '1cbf949a-76e3-41e2-a37a-78179423eb29' });
  expect(connection.receive).not.toHaveBeenCalled();
});
