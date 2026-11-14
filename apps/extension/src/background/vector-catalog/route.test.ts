import { afterEach, expect, it, vi } from 'vitest';
import type { EditorVectorSettings } from '../../composition/persistence/vector-elements';
import type { CatalogRequest } from '../../features/editor/vector-catalog';
import { createEditorVectorCatalogRoute } from './route';
const initial: EditorVectorSettings = {
  key: 'settings',
  kind: 'settings',
  baseUrl: 'https://example.test/api/',
  incarnation: 'configured',
  revision: 1,
  networkEnabled: true,
  disclosureAccepted: true,
  sourceGeneration: 1,
};
const request: CatalogRequest = {
  operation: 'search',
  query: 'private query',
  requestId: 'search',
  source: { sourceId: initial.baseUrl, incarnation: initial.incarnation, generation: 1 },
};
const body = () =>
  new Response(JSON.stringify({ icons: ['mdi:heart'], limit: 64, start: 0, total: 1 }));
afterEach(() => vi.useRealTimers());
it.each(['networkEnabled', 'disclosureAccepted'] as const)(
  'denies persisted %s refusal before optional permission and fetch',
  async (field) => {
    const fetch = vi.fn();
    const contains = vi.fn();
    const route = createEditorVectorCatalogRoute({
      readSettings: async () => ({ ...initial, [field]: false }),
      contains,
      fetch,
    });
    expect(await route.execute(request, 'caller')).toMatchObject({
      success: false,
      error: field === 'networkEnabled' ? 'network-disabled' : 'disclosure-required',
    });
    expect(contains).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  }
);
it('checks current optional host permission immediately before issuing an admitted request', async () => {
  const fetch = vi.fn(async () => body());
  const contains = vi.fn(async () => false);
  const route = createEditorVectorCatalogRoute({
    readSettings: async () => initial,
    contains,
    fetch,
  });
  expect(await route.execute(request, 'caller')).toEqual({
    success: false,
    error: 'permission-required',
  });
  expect(contains).toHaveBeenCalledWith({ origins: ['https://example.test/*'] });
  expect(fetch).not.toHaveBeenCalled();
});
it('rechecks the persisted generation after an asynchronous permission result', async () => {
  let settings = initial;
  let release: (allowed: boolean) => void = () => {};
  let entered: () => void = () => {};
  const checked = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const fetch = vi.fn();
  const route = createEditorVectorCatalogRoute({
    readSettings: async () => settings,
    fetch,
    contains: () =>
      new Promise<boolean>((resolve) => {
        release = resolve;
        entered();
      }),
  });
  const pending = route.execute(request, 'caller');
  await checked;
  settings = { ...initial, baseUrl: 'https://replacement.test/', sourceGeneration: 2 };
  release(true);
  expect(await pending).toEqual({ success: false, error: 'source-changed' });
  expect(fetch).not.toHaveBeenCalled();
});
it('rejects a late response after source replacement instead of returning it to another generation', async () => {
  let settings = initial;
  let release: (response: Response) => void = () => {};
  let entered: () => void = () => {};
  const issued = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const route = createEditorVectorCatalogRoute({
    readSettings: async () => settings,
    contains: async () => true,
    fetch: () =>
      new Promise<Response>((resolve) => {
        release = resolve;
        entered();
      }),
  });
  const pending = route.execute(request, 'caller');
  await issued;
  settings = { ...initial, sourceGeneration: 2 };
  release(body());
  expect(await pending).toEqual({ success: false, error: 'source-changed' });
});
it('binds cancellation to the caller and request identity and permits a later retry', async () => {
  const state: { signal: AbortSignal | null } = { signal: null };
  let entered: () => void = () => {};
  const issued = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const fetch: typeof globalThis.fetch = (_url, options) =>
    new Promise<Response>((_resolve, reject) => {
      state.signal = options?.signal ?? null;
      state.signal?.addEventListener('abort', () => reject(new Error('private provider detail')), {
        once: true,
      });
      entered();
    });
  const route = createEditorVectorCatalogRoute({
    readSettings: async () => initial,
    contains: async () => true,
    fetch,
  });
  const pending = route.execute(request, 'first');
  await issued;
  expect(await route.execute({ operation: 'cancel', requestId: 'search' }, 'second')).toEqual({
    success: true,
    operation: 'cancel',
  });
  expect(state.signal?.aborted).toBe(false);
  expect(await route.execute(request, 'first')).toEqual({ success: false, error: 'busy' });
  await route.execute({ operation: 'cancel', requestId: 'search' }, 'first');
  expect(await pending).toEqual({ success: false, error: 'canceled' });
});
it('ends a hanging native request at the registered deadline with a fixed timeout code', async () => {
  vi.useFakeTimers();
  let entered: () => void = () => {};
  const issued = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const fetch: typeof globalThis.fetch = (_url, options) =>
    new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error('raw timeout detail')), {
        once: true,
      });
      entered();
    });
  const route = createEditorVectorCatalogRoute({
    readSettings: async () => initial,
    contains: async () => true,
    fetch,
  });
  const pending = route.execute(request, 'caller');
  await issued;
  await vi.advanceTimersByTimeAsync(10_000);
  expect(await pending).toEqual({ success: false, error: 'timeout' });
});
