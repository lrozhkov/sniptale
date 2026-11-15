import { afterEach, expect, it, vi } from 'vitest';
import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { createRuntimePortFixture } from '../../../../../tooling/test/support/chrome-runtime-port';
import {
  CATALOG_PORT_NAME,
  MAX_CATALOG_BYTES,
  createCatalogTransport,
  loadCatalogMessages,
  parseCatalogRequest,
} from './catalog-transport';

const messages = { 'common.actions.close': 'Close' };

function setup(extension = false) {
  const port = createRuntimePortFixture({ name: CATALOG_PORT_NAME });
  const fetch = vi.fn(
    async (_input: string, _init?: RequestInit) => new Response(JSON.stringify(messages))
  );
  const connect = vi.fn(() => port.port);
  const transport = createCatalogTransport({
    getURL: (path) => `chrome-extension://own/${path}`,
    connect,
    fetch,
    isExtensionContext: () => extension,
    timeoutMs: 100,
  });
  return { ...port, transport, fetch, connect };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('routes the public loader through packaged data in an extension document', async () => {
  vi.spyOn(browserRuntime, 'getURL').mockImplementation((path) => `chrome-extension://own/${path}`);
  vi.stubGlobal(
    'location',
    new URL('chrome-extension://own/apps/extension/src/settings/index.html')
  );
  const fetch = vi.fn(
    async (_input: string, _init?: RequestInit) => new Response(JSON.stringify(messages))
  );
  vi.stubGlobal('fetch', fetch);
  await expect(loadCatalogMessages('en', 'settings')).resolves.toEqual(messages);
  expect(fetch.mock.calls[0]?.[0]).toBe('chrome-extension://own/i18n/settings/en.json');
});

it('routes the public loader through the broker on a host page', async () => {
  vi.spyOn(browserRuntime, 'getURL').mockImplementation((path) => `chrome-extension://own/${path}`);
  vi.stubGlobal('location', new URL('https://example.com/'));
  const fixture = createRuntimePortFixture();
  vi.spyOn(browserRuntime, 'connect').mockReturnValue(fixture.port);
  const load = loadCatalogMessages('en', 'content');
  fixture.onMessage.emit({ locale: 'en', profile: 'content', messages });
  await expect(load).resolves.toEqual(messages);
});

it('reads only the fixed packaged resource in extension contexts', async () => {
  const fixture = setup(true);
  await expect(fixture.transport.load('en', 'popup')).resolves.toEqual(messages);
  expect(fixture.fetch).toHaveBeenCalledExactlyOnceWith(
    'chrome-extension://own/i18n/popup/en.json',
    { signal: expect.any(AbortSignal) }
  );
  expect(fixture.connect).not.toHaveBeenCalled();
});

it('uses one checked Port reply in content and removes both listeners', async () => {
  const fixture = setup();
  const removeMessage = vi.spyOn(fixture.onMessage, 'removeListener');
  const removeDisconnect = vi.spyOn(fixture.onDisconnect, 'removeListener');
  const load = fixture.transport.load('ru', 'content');
  expect(fixture.postMessage).toHaveBeenCalledExactlyOnceWith({ locale: 'ru', profile: 'content' });
  fixture.onMessage.emit({ locale: 'ru', profile: 'content', messages });
  await expect(load).resolves.toEqual(messages);
  expect(fixture.disconnect).toHaveBeenCalledOnce();
  expect(removeMessage).toHaveBeenCalledOnce();
  expect(removeDisconnect).toHaveBeenCalledOnce();
  expect(fixture.fetch).not.toHaveBeenCalled();
});

it.each([
  null,
  { locale: 'unregistered-locale', profile: 'content' },
  { locale: 'en', profile: '../../private' },
  { locale: 'en', profile: 'content', path: 'private.json' },
])('rejects an unregistered or open catalog request %j', (request) => {
  expect(parseCatalogRequest(request)).toBeNull();
});

it.each([
  { locale: 'ru', profile: 'content', messages },
  { locale: 'en', profile: 'popup', messages },
  { locale: 'en', profile: 'content', messages: { 'common.actions.close': 1 } },
  { locale: 'en', profile: 'content', messages, extra: true },
  { error: 'catalog-unavailable' },
])('rejects malformed or mismatched replies %j and permits retry', async (reply) => {
  const fixture = setup();
  const load = fixture.transport.load('en', 'content');
  const rejected = expect(load).rejects.toThrow('Invalid translation catalog reply');
  fixture.onMessage.emit(reply);
  await rejected;
  expect(fixture.disconnect).toHaveBeenCalledOnce();
  const retry = fixture.transport.load('en', 'content');
  fixture.onMessage.emit({ locale: 'en', profile: 'content', messages });
  await expect(retry).resolves.toEqual(messages);
});

it('rejects oversized packaged data before parsing and oversized Port data before publication', async () => {
  const packaged = setup(true);
  packaged.fetch.mockResolvedValueOnce(new Response('x'.repeat(MAX_CATALOG_BYTES + 1)));
  await expect(packaged.transport.load('en', 'popup')).rejects.toThrow('size limit');
  const content = setup();
  const load = content.transport.load('en', 'content');
  const rejected = expect(load).rejects.toThrow('Invalid translation catalog reply');
  content.onMessage.emit({
    locale: 'en',
    profile: 'content',
    messages: { 'common.large': 'x'.repeat(MAX_CATALOG_BYTES) },
  });
  await rejected;
  expect(content.disconnect).toHaveBeenCalledOnce();
});

it('cleans a disconnected request and a request that reaches its deadline', async () => {
  vi.useFakeTimers();
  const disconnected = setup();
  const first = expect(disconnected.transport.load('en', 'content')).rejects.toThrow(
    'connection closed'
  );
  disconnected.onDisconnect.emit(disconnected.port);
  await first;
  expect(disconnected.disconnect).toHaveBeenCalledOnce();
  const expired = setup();
  const second = expect(expired.transport.load('en', 'content')).rejects.toThrow('timed out');
  await vi.advanceTimersByTimeAsync(100);
  await second;
  expect(expired.disconnect).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it('retries local resource failures without retaining a failed request', async () => {
  const fixture = setup(true);
  fixture.fetch.mockResolvedValueOnce(new Response('', { status: 404 }));
  await expect(fixture.transport.load('en', 'popup')).rejects.toThrow('unavailable');
  await expect(fixture.transport.load('en', 'popup')).resolves.toEqual(messages);
  expect(fixture.fetch).toHaveBeenCalledTimes(2);
});

it('aborts a local read that reaches its deadline', async () => {
  vi.useFakeTimers();
  const fixture = setup(true);
  fixture.fetch.mockImplementationOnce(
    (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('Local read aborted')));
      })
  );
  const load = expect(fixture.transport.load('en', 'popup')).rejects.toThrow('Local read aborted');
  await vi.advanceTimersByTimeAsync(100);
  await load;
  expect(vi.getTimerCount()).toBe(0);
});

it('cleans a request when posting to its Port throws', async () => {
  const fixture = setup();
  fixture.postMessage.mockImplementationOnce(() => {
    throw new Error('Disconnected');
  });
  await expect(fixture.transport.load('en', 'content')).rejects.toThrow('request failed');
  expect(fixture.disconnect).toHaveBeenCalledOnce();
});
