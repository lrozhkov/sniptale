import { afterEach, expect, it, vi } from 'vitest';
import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { createRuntimePortFixture } from '../../../../../tooling/test/support/chrome-runtime-port';
import { CATALOG_PORT_NAME, MAX_CATALOG_BYTES } from '../../platform/i18n/catalog-transport';
import { registerCatalogPorts } from './catalog-port';

const messages = { 'common.actions.close': 'Close' };
const sender: chrome.runtime.MessageSender = {
  id: 'own',
  tab: { id: 7 } as chrome.tabs.Tab,
  frameId: 0,
  documentId: 'document-1',
  url: 'https://example.com/',
};

function setup() {
  let accept: (port: chrome.runtime.Port) => void = () => {};
  const unsubscribe = vi.fn();
  const load = vi.fn(async () => messages);
  const dispose = registerCatalogPorts({
    getExtensionId: () => 'own',
    subscribe: (listener) => {
      accept = listener;
      return unsubscribe;
    },
    load,
    timeoutMs: 100,
  });
  function connect(
    overrides: Partial<chrome.runtime.MessageSender> = {},
    name = CATALOG_PORT_NAME
  ) {
    const fixture = createRuntimePortFixture({ name, sender: { ...sender, ...overrides } });
    accept(fixture.port);
    return fixture;
  }
  return { accept, connect, load, dispose, unsubscribe };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('registers the public adapter synchronously and reads packaged data in background', async () => {
  let accept: (port: chrome.runtime.Port) => void = () => {};
  const unsubscribe = vi.fn();
  vi.spyOn(browserRuntime, 'subscribeToConnections').mockImplementation((listener) => {
    accept = listener;
    return unsubscribe;
  });
  vi.spyOn(browserRuntime, 'getURL').mockImplementation((path) => `chrome-extension://own/${path}`);
  vi.stubGlobal('location', new URL('chrome-extension://own/background.js'));
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(messages)))
  );
  const dispose = registerCatalogPorts();
  const port = createRuntimePortFixture({ name: CATALOG_PORT_NAME, sender });
  accept(port.port);
  port.onMessage.emit({ locale: 'en', profile: 'content' });
  await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalledOnce());
  expect(port.postMessage).toHaveBeenCalledWith({ locale: 'en', profile: 'content', messages });
  dispose();
  expect(unsubscribe).toHaveBeenCalledOnce();
});

it('serves one selected content catalog to a same-extension sender and cleans the Port', async () => {
  const fixture = setup();
  const port = fixture.connect();
  port.onMessage.emit({ locale: 'en', profile: 'content' });
  await vi.waitFor(() => expect(port.disconnect).toHaveBeenCalledOnce());
  expect(fixture.load).toHaveBeenCalledExactlyOnceWith('en', 'content');
  expect(port.postMessage).toHaveBeenCalledExactlyOnceWith({
    locale: 'en',
    profile: 'content',
    messages,
  });
  fixture.dispose();
  expect(fixture.unsubscribe).toHaveBeenCalledOnce();
});

it.each([
  { id: 'foreign' },
  { frameId: -1 },
  { documentId: '' },
  { url: 'chrome-extension://own/apps/extension/src/settings/index.html' },
  { url: 'invalid' },
])('rejects unauthorized content sender metadata %j', (overrides) => {
  const fixture = setup();
  const port = fixture.connect(overrides);
  expect(port.disconnect).toHaveBeenCalledOnce();
  expect(fixture.load).not.toHaveBeenCalled();
  fixture.dispose();
});

it('rejects a sender whose metadata omits the content tab', () => {
  const fixture = setup();
  const port = createRuntimePortFixture({
    name: CATALOG_PORT_NAME,
    sender: { id: 'own', frameId: 0, documentId: 'document-1', url: 'https://example.com/' },
  });
  fixture.accept(port.port);
  expect(port.disconnect).toHaveBeenCalledOnce();
  expect(fixture.load).not.toHaveBeenCalled();
  fixture.dispose();
});

it.each([
  { locale: 'unregistered-locale', profile: 'content' },
  { locale: 'en', profile: 'background' },
  { locale: 'en', profile: 'settings' },
  { locale: 'en', profile: '../settings' },
  { locale: 'en', profile: 'content', url: '/private.json' },
])('rejects unknown or non-content selections %j', (request) => {
  const fixture = setup();
  const port = fixture.connect();
  port.onMessage.emit(request);
  expect(port.disconnect).toHaveBeenCalledOnce();
  expect(fixture.load).not.toHaveBeenCalled();
  fixture.dispose();
});

it('rejects a second request while the first resource is pending', async () => {
  const fixture = setup();
  let complete = (_value: typeof messages) => {};
  fixture.load.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      })
  );
  const port = fixture.connect();
  port.onMessage.emit({ locale: 'en', profile: 'content' });
  port.onMessage.emit({ locale: 'ru', profile: 'content' });
  expect(port.disconnect).toHaveBeenCalledOnce();
  complete(messages);
  await Promise.resolve();
  await Promise.resolve();
  expect(port.postMessage).not.toHaveBeenCalled();
  expect(fixture.load).toHaveBeenCalledOnce();
  fixture.dispose();
});

it('does not publish oversized data and permits a new request after resource failure', async () => {
  const fixture = setup();
  fixture.load.mockResolvedValueOnce({ 'common.actions.close': 'x'.repeat(MAX_CATALOG_BYTES) });
  const rejected = fixture.connect();
  rejected.onMessage.emit({ locale: 'en', profile: 'content' });
  await vi.waitFor(() => expect(rejected.disconnect).toHaveBeenCalledOnce());
  expect(rejected.postMessage).toHaveBeenCalledExactlyOnceWith({ error: 'catalog-unavailable' });
  const retry = fixture.connect();
  retry.onMessage.emit({ locale: 'en', profile: 'content-shim' });
  await vi.waitFor(() => expect(retry.disconnect).toHaveBeenCalledOnce());
  expect(retry.postMessage).toHaveBeenCalledExactlyOnceWith({
    locale: 'en',
    profile: 'content-shim',
    messages,
  });
  fixture.dispose();
});

it('cleans idle, disconnected, and disposed Ports without serving late replies', async () => {
  vi.useFakeTimers();
  const fixture = setup();
  const idle = fixture.connect();
  await vi.advanceTimersByTimeAsync(100);
  expect(idle.disconnect).toHaveBeenCalledOnce();
  const disconnected = fixture.connect();
  disconnected.onDisconnect.emit(disconnected.port);
  expect(disconnected.disconnect).toHaveBeenCalledOnce();
  const disposed = fixture.connect();
  fixture.dispose();
  expect(disposed.disconnect).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it('ignores unrelated Port names and bounds concurrent idle requests', () => {
  const fixture = setup();
  const unrelated = fixture.connect({}, 'other-service');
  expect(unrelated.disconnect).not.toHaveBeenCalled();
  const idle = Array.from({ length: 32 }, () => fixture.connect());
  expect(fixture.connect().disconnect).toHaveBeenCalledOnce();
  fixture.dispose();
  expect(idle.every((port) => port.disconnect.mock.calls.length === 1)).toBe(true);
});
