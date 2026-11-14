import { afterEach, expect, it, vi } from 'vitest';
import type { EditorVectorSettings } from '../../composition/persistence/vector-elements';
import { isCatalogCommand, type CatalogResponse } from '../../features/editor/vector-catalog';
import { createEditorVectorCatalogClient, requestEditorVectorCatalogPermission } from './client';
const settings: EditorVectorSettings = {
  key: 'settings',
  kind: 'settings',
  incarnation: 'source',
  revision: 1,
  baseUrl: 'https://example.test/nested/',
  networkEnabled: true,
  disclosureAccepted: true,
  sourceGeneration: 1,
};
const source = { sourceId: settings.baseUrl, incarnation: settings.incarnation, generation: 1 };
afterEach(() => vi.unstubAllGlobals());
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
it('cancels the captured native request and removes the listener after a completed request', async () => {
  const entered = deferred<string>();
  const response = deferred<CatalogResponse>();
  const canceled: string[] = [];
  const sendRuntimeMessage = vi.fn().mockImplementation(async (message: unknown) => {
    if (!isCatalogCommand(message)) throw new Error('Invalid fixture catalog command.');
    if (message.operation === 'cancel') {
      canceled.push(message.requestId);
      return { success: true, operation: 'cancel' };
    }
    if (message.operation === 'search' && message.query === 'pending') {
      entered.resolve(message.requestId);
      return response.promise;
    }
    return { success: true, operation: 'search', source, data: { icons: [], start: 0, limit: 64 } };
  });
  const client = createEditorVectorCatalogClient({
    native: true,
    readSettings: async () => settings,
    messaging: { sendRuntimeMessage },
  });
  const completed = new AbortController();
  await client.search({ query: 'completed' }, completed.signal);
  completed.abort();
  expect(canceled).toEqual([]);
  const controller = new AbortController();
  const pending = client.search({ query: 'pending' }, controller.signal);
  const requestId = await entered.promise;
  controller.abort();
  expect(canceled).toEqual([requestId]);
  response.resolve({
    success: true,
    operation: 'search',
    source,
    data: { icons: [], start: 0, limit: 64 },
  });
  await expect(pending).rejects.toMatchObject({ code: 'canceled' });
});
it('refuses direct egress when settings change during the immediate beforeSend admission', async () => {
  const entered = deferred<void>();
  const admission = deferred<EditorVectorSettings>();
  let reads = 0;
  const fetch = vi.fn<typeof globalThis.fetch>();
  const client = createEditorVectorCatalogClient({
    native: false,
    fetch,
    readSettings: async () => {
      if (++reads === 2) {
        entered.resolve();
        return admission.promise;
      }
      return settings;
    },
  });
  const pending = client.collections();
  await entered.promise;
  admission.resolve({ ...settings, networkEnabled: false, sourceGeneration: 2 });
  await expect(pending).rejects.toMatchObject({ code: 'network-disabled' });
  expect(fetch).not.toHaveBeenCalled();
});
it('uses real direct transport in plain Vite even when browser mocks provide chrome.runtime.id', async () => {
  vi.stubGlobal('location', { protocol: 'http:', hostname: 'localhost' });
  vi.stubGlobal('chrome', { runtime: { id: 'mock-native-id' } });
  const sendRuntimeMessage = vi.fn();
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response(JSON.stringify({ icons: ['mdi:heart'], limit: 64, start: 0 }))
  );
  const client = createEditorVectorCatalogClient({
    readSettings: async () => settings,
    messaging: { sendRuntimeMessage },
    fetch,
  });
  expect(await client.search({ query: 'heart' })).toMatchObject({
    source,
    data: { icons: ['mdi:heart'] },
  });
  expect(fetch).toHaveBeenCalledOnce();
  expect(sendRuntimeMessage).not.toHaveBeenCalled();
});
it('routes native requests through injected typed messaging and returns the same data wrapper', async () => {
  const sendRuntimeMessage = vi.fn().mockResolvedValue({
    success: true,
    operation: 'search',
    source,
    data: { icons: ['mdi:heart'], limit: 64, start: 0 },
  });
  const fetch = vi.fn();
  const client = createEditorVectorCatalogClient({
    readSettings: async () => settings,
    native: true,
    messaging: { sendRuntimeMessage },
    fetch,
  });
  expect(await client.search({ query: 'heart' })).toMatchObject({
    source,
    data: { icons: ['mdi:heart'] },
  });
  expect(sendRuntimeMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'EDITOR_VECTOR_CATALOG_COMMAND',
      operation: 'search',
      source,
      query: 'heart',
    })
  );
  expect(fetch).not.toHaveBeenCalled();
});
it('rejects a stale direct response after source disable and preserves fixed failure codes', async () => {
  let current = settings;
  let entered: () => void = () => {};
  let release: (response: Response) => void = () => {};
  const issued = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const client = createEditorVectorCatalogClient({
    native: false,
    readSettings: async () => current,
    fetch: () =>
      new Promise<Response>((resolve) => {
        release = resolve;
        entered();
      }),
  });
  const pending = client.search({ query: 'heart' });
  await issued;
  current = { ...settings, networkEnabled: false, sourceGeneration: 2 };
  release(new Response(JSON.stringify({ icons: ['mdi:heart'], start: 0, limit: 64 })));
  await expect(pending).rejects.toMatchObject({ code: 'source-changed' });
});
it('does not send or fetch without persisted consent and network enablement', async () => {
  const sendRuntimeMessage = vi.fn();
  const fetch = vi.fn();
  const client = createEditorVectorCatalogClient({
    readSettings: async () => ({ ...settings, disclosureAccepted: false }),
    messaging: { sendRuntimeMessage },
    fetch,
  });
  await expect(client.collections()).rejects.toMatchObject({ code: 'disclosure-required' });
  expect(sendRuntimeMessage).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it('requests native host permission synchronously in the click stack without a settings read', async () => {
  vi.stubGlobal('location', { protocol: 'chrome-extension:', hostname: 'test' });
  const request = vi.fn((_permissions: unknown, callback: (allowed: boolean) => void) =>
    callback(true)
  );
  vi.stubGlobal('chrome', { runtime: { id: 'test' }, permissions: { request } });
  const permission = requestEditorVectorCatalogPermission('https://example.test/nested/');
  expect(request).toHaveBeenCalledExactlyOnceWith(
    { origins: ['https://example.test/*'] },
    expect.any(Function)
  );
  expect(await permission).toBe(true);
});

it('returns each native catalog operation and rejects a response for another operation', async () => {
  const sendRuntimeMessage = vi.fn().mockImplementation(async (message: unknown) => {
    if (!isCatalogCommand(message) || message.operation === 'cancel')
      throw new Error('Unexpected fixture request.');
    return { success: true, operation: message.operation, source, data: {} };
  });
  const client = createEditorVectorCatalogClient({
    native: true,
    readSettings: async () => settings,
    messaging: { sendRuntimeMessage },
  });
  await expect(client.collections()).resolves.toMatchObject({ operation: 'collections', source });
  await expect(client.collection('mdi')).resolves.toMatchObject({
    operation: 'collection',
    source,
  });
  await expect(client.assets('mdi', ['heart'])).resolves.toMatchObject({
    operation: 'assets',
    source,
  });
  await expect(client.check()).resolves.toMatchObject({ operation: 'check', source });
  sendRuntimeMessage.mockResolvedValue({ success: true, operation: 'search', source, data: {} });
  for (const request of [
    () => client.collections(),
    () => client.collection('mdi'),
    () => client.assets('mdi', ['heart']),
    () => client.check(),
  ])
    await expect(request()).rejects.toMatchObject({ code: 'response-invalid' });
});

it('preserves native retry advice and refuses invalid or already canceled requests before dispatch', async () => {
  const sendRuntimeMessage = vi.fn().mockResolvedValue({
    success: false,
    error: 'rate-limited',
    retryAfterSeconds: 30,
  });
  const client = createEditorVectorCatalogClient({
    native: true,
    readSettings: async () => settings,
    messaging: { sendRuntimeMessage },
  });
  await expect(client.search({ query: 'heart' })).rejects.toMatchObject({
    code: 'rate-limited',
    retryAfterSeconds: 30,
  });
  sendRuntimeMessage.mockClear();
  await expect(client.collection('invalid prefix')).rejects.toMatchObject({
    code: 'invalid-request',
  });
  const controller = new AbortController();
  controller.abort();
  await expect(client.check(controller.signal)).rejects.toMatchObject({ code: 'canceled' });
  expect(sendRuntimeMessage).not.toHaveBeenCalled();
});

it('refuses direct egress when a different enabled source replaces the captured source', async () => {
  let reads = 0;
  const fetch = vi.fn<typeof globalThis.fetch>();
  const client = createEditorVectorCatalogClient({
    native: false,
    fetch,
    readSettings: async () => (++reads === 1 ? settings : { ...settings, sourceGeneration: 2 }),
  });
  await expect(client.check()).rejects.toMatchObject({ code: 'source-changed' });
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  'not a url',
  'http://example.test/',
  'https://user:secret@example.test/',
  'https://example.test/?query=1',
  'https://example.test/#fragment',
])('refuses invalid permission origin %s', async (url) => {
  await expect(requestEditorVectorCatalogPermission(url)).resolves.toBe(false);
});
