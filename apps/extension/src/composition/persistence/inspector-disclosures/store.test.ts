import { expect, it, vi } from 'vitest';
import { createInspectorDisclosureStore } from './store';

it('restores choices across store lifetimes without losing unrelated type/group keys', async () => {
  const values: Record<string, unknown> = {};
  const storage = {
    get: vi.fn(async () => values),
    set: vi.fn(async (next: Record<string, unknown>) => {
      Object.assign(values, next);
    }),
  };
  const first = createInspectorDisclosureStore(storage);
  await first.set('video:clip:audio', false);
  await first.set('video:scene:canvas', true);
  const next = createInspectorDisclosureStore(storage);
  await next.load('video:clip:audio');
  await next.load('video:scene:canvas');
  expect(next.read('video:clip:audio')).toBe(false);
  expect(next.read('video:scene:canvas')).toBe(true);
  expect(storage.get).toHaveBeenCalledTimes(2);
  await next.load('video:clip:audio');
  expect(storage.get).toHaveBeenCalledTimes(2);
});

it.each([null, 'false', {}, 0])(
  'ignores malformed preference %j without repairing storage',
  async (value) => {
    const set = vi.fn();
    const store = createInspectorDisclosureStore({
      get: async () => ({ 'sniptale_inspector_disclosure_v1:key': value }),
      set,
    });
    await store.load('key');
    expect(store.read('key')).toBeUndefined();
    expect(set).not.toHaveBeenCalled();
  }
);

it('does not let a late load override the user and serializes rapid clicks', async () => {
  let resolve!: (value: Record<string, unknown>) => void;
  const stored: boolean[] = [];
  const store = createInspectorDisclosureStore({
    get: () =>
      new Promise((done) => {
        resolve = done;
      }),
    set: async (value) => {
      stored.push(value['sniptale_inspector_disclosure_v1:key'] === true);
    },
  });
  const load = store.load('key');
  const first = store.set('key', false);
  const second = store.set('key', true);
  resolve({ 'sniptale_inspector_disclosure_v1:key': false });
  await Promise.all([load, first, second]);
  expect(store.read('key')).toBe(true);
  expect(stored).toEqual([false, true]);
});

it('keeps advisory choices editable after read/write failure and unsubscribes', async () => {
  const store = createInspectorDisclosureStore({
    get: async () => {
      throw Error('unavailable');
    },
    set: async () => {
      throw Error('quota');
    },
  });
  const listener = vi.fn();
  const unsubscribe = store.subscribe(listener);
  await store.load('key');
  await store.set('key', false);
  expect(store.read('key')).toBe(false);
  expect(listener).toHaveBeenCalledOnce();
  unsubscribe();
  await store.set('key', true);
  expect(store.read('key')).toBe(true);
  expect(listener).toHaveBeenCalledOnce();
});
