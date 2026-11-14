// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { computeEditorVectorDefinitionDigest } from '../../../features/editor/document/vector-element';
import { EditorVectorCatalogError } from '../../../features/editor/vector-catalog';
import { createEditorVectorLibrarySession, type EditorVectorCatalogPort } from './session';
import { deferred, fixture, file, svg } from './session.test-support';

describe('vector catalog request lifetime', () => {
  it('never searches while offline or before consent and does not send an empty query', async () => {
    const f = fixture();
    await f.session.refresh();
    f.session.setQuery('heart');
    await f.session.searchNow(true);
    expect(f.catalog.search).not.toHaveBeenCalled();
    f.setSettings({ networkEnabled: true, disclosureAccepted: true });
    f.session.setQuery('');
    await f.session.refresh();
    expect(f.catalog.search).not.toHaveBeenCalled();
    f.session.dispose();
  });
  it('refuses an older search result after a newer search has prepared its artwork', async () => {
    const f = fixture();
    f.setSettings({ networkEnabled: true, disclosureAccepted: true });
    await f.session.refresh();
    const old = deferred<{ source: typeof f.source; data: unknown }>();
    f.catalog.search = vi.fn(async (input) =>
      input.query === 'old'
        ? old.promise
        : { source: f.source, data: { icons: ['test:new'], start: 0, limit: 64 } }
    );
    f.session.setQuery('old');
    const pending = f.session.searchNow(true);
    f.session.setQuery('new');
    await f.session.searchNow(true);
    old.resolve({ source: f.source, data: { icons: ['test:old'], start: 0, limit: 64 } });
    await pending;
    expect(f.session.getSnapshot().entries.map((row) => row.key)).toEqual(['test:new']);
    expect(f.session.getSnapshot().entries[0]?.definition).not.toBeNull();
    f.session.dispose();
  });
});
describe('vector catalog cache admission', () => {
  it('reuses persisted metadata and fully validated artwork after session restart without network calls', async () => {
    const f = fixture();
    f.setSettings({ networkEnabled: true, disclosureAccepted: true });
    const rows = new Map<string, unknown>();
    vi.mocked(f.cache.read).mockImplementation(
      async (key) => rows.get(JSON.stringify(key)) ?? null
    );
    vi.mocked(f.cache.put).mockImplementation(async (key, value) => {
      rows.set(JSON.stringify(key), value);
      return true;
    });
    f.catalog.search = vi.fn(async () => ({
      source: f.source,
      data: { icons: ['test:new'], start: 0, limit: 64 },
    }));
    await f.session.refresh();
    f.session.setQuery('heart');
    await f.session.searchNow(true);
    expect(f.catalog.assets).toHaveBeenCalledOnce();
    f.session.dispose();
    const restarted = createEditorVectorLibrarySession(f.dependencies);
    await restarted.refresh();
    restarted.setQuery('heart');
    await restarted.searchNow(true);
    expect(f.catalog.search).toHaveBeenCalledOnce();
    expect(f.catalog.assets).toHaveBeenCalledOnce();
    expect(f.cache.touch).toHaveBeenCalled();
    expect(restarted.getSnapshot().entries[0]?.definition).not.toBeNull();
    restarted.dispose();
  });
  it('rejects a correctly hashed unsafe definition from the advisory cache before preview', async () => {
    const f = fixture();
    f.setSettings({ networkEnabled: true, disclosureAccepted: true });
    const rows = new Map<string, unknown>();
    vi.mocked(f.cache.read).mockImplementation(
      async (key) => rows.get(JSON.stringify(key)) ?? null
    );
    vi.mocked(f.cache.put).mockImplementation(async (key, value) => {
      rows.set(JSON.stringify(key), value);
      return true;
    });
    f.catalog.search = vi.fn(async () => ({
      source: f.source,
      data: { icons: ['test:new'], start: 0, limit: 64 },
    }));
    await f.session.refresh();
    f.session.setQuery('heart');
    await f.session.searchNow(true);
    const definition = f.session.getSnapshot().entries[0]?.definition;
    if (!definition) throw new Error('Missing prepared fixture.');
    const forged = {
      ...definition,
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><script>alert(1)</script></svg>',
    };
    forged.id = await computeEditorVectorDefinitionDigest(forged);
    const key = [...rows.keys()].find((key) => key.includes('"kind":"definition"'));
    if (!key) throw new Error('Missing definition cache.');
    rows.set(key, forged);
    f.session.dispose();
    const restarted = createEditorVectorLibrarySession(f.dependencies);
    await restarted.refresh();
    restarted.setQuery('heart');
    await restarted.searchNow(true);
    expect(f.catalog.assets).toHaveBeenCalledTimes(2);
    expect(restarted.getSnapshot().entries[0]?.definition?.svg).not.toContain('<script');
    restarted.dispose();
  });
});
describe('vector catalog pagination and retry', () => {
  it('loads the next search page only after an explicit command and deduplicates IDs', async () => {
    const f = fixture();
    f.setSettings({ networkEnabled: true, disclosureAccepted: true });
    f.catalog.search = vi.fn(async (input) => ({
      source: f.source,
      data: {
        icons: input.start
          ? ['test:icon0', 'test:last']
          : Array.from({ length: 64 }, (_, index) => `test:icon${index}`),
        start: input.start ?? 0,
        limit: 64,
      },
    }));
    f.catalog.assets = vi.fn<EditorVectorCatalogPort['assets']>(async (prefix, names) => ({
      source: f.source,
      data: {
        prefix,
        width: 24,
        height: 24,
        icons: Object.fromEntries(names.map((name) => [name, { body: '<path d="M0 0h10v10z"/>' }])),
      },
    }));
    await f.session.refresh();
    f.session.setQuery('heart');
    await f.session.searchNow(true);
    expect(f.catalog.search).toHaveBeenCalledOnce();
    expect(f.session.getSnapshot().hasMore).toBe(true);
    await f.session.loadMore();
    expect(f.catalog.search).toHaveBeenCalledTimes(2);
    expect(vi.mocked(f.catalog.search).mock.calls[1]?.[0].start).toBe(64);
    expect(f.session.getSnapshot().entries).toHaveLength(65);
    expect(f.session.getSnapshot().hasMore).toBe(false);
    f.session.dispose();
  });
  it('reports rate limiting as an error and blocks retry until its server cooldown expires', async () => {
    vi.useFakeTimers();
    try {
      const f = fixture();
      f.setSettings({ networkEnabled: true, disclosureAccepted: true });
      await f.session.refresh();
      f.catalog.search = vi.fn(async () => {
        throw new EditorVectorCatalogError('rate-limited', 60);
      });
      f.session.setQuery('heart');
      await f.session.searchNow(true);
      expect(f.session.getSnapshot().status).toBe('error');
      expect(f.session.getSnapshot().errorCode).toBe('rate-limited');
      expect(f.session.getSnapshot().entries).toEqual([]);
      await f.session.searchNow(true);
      expect(f.catalog.search).toHaveBeenCalledOnce();
      vi.setSystemTime(Date.now() + 60001);
      f.catalog.search = vi.fn(async () => ({
        source: f.source,
        data: { icons: [], start: 0, limit: 64 },
      }));
      await f.session.searchNow(true);
      expect(f.session.getSnapshot().status).toBe('ready');
      expect(f.session.getSnapshot().error).toBe(false);
      f.session.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
describe('vector source permission admission', () => {
  it('keeps the original settings revision when a refresh overtakes permission completion', async () => {
    const f = fixture();
    await f.session.refresh();
    const accepted = await f.library.readSettings();
    vi.mocked(f.library.readSettings).mockImplementationOnce(async () => {
      f.setSettings({ baseUrl: 'https://replacement.example/', revision: 1, sourceGeneration: 1 });
      await f.session.refresh();
      return accepted;
    });
    expect(await f.session.enableSource('https://api.iconify.design/', true)).toBe(false);
    expect(f.library.updateSettings).toHaveBeenCalledWith(
      { baseUrl: 'https://api.iconify.design/', networkEnabled: true, disclosureAccepted: true },
      { incarnation: 'source', revision: 0 }
    );
    expect(f.session.getSnapshot().settings?.baseUrl).toBe('https://replacement.example/');
    f.session.dispose();
  });
  it('requests permission synchronously and refuses a grant for replaced settings', async () => {
    const f = fixture();
    await f.session.refresh();
    const grant = deferred<boolean>();
    f.requestPermission.mockImplementation(() => grant.promise);
    vi.mocked(f.library.readSettings).mockClear();
    const enable = f.session.enableSource('https://api.iconify.design/', true);
    expect(f.requestPermission).toHaveBeenCalledOnce();
    expect(f.library.readSettings).not.toHaveBeenCalled();
    f.setSettings({ incarnation: 'replacement' });
    grant.resolve(true);
    expect(await enable).toBe(false);
    expect(f.library.updateSettings).not.toHaveBeenCalled();
    f.session.dispose();
  });
});

it('reads cache usage only on an explicit settings read and refreshes occupancy after clearing the cache', async () => {
  const f = fixture();
  vi.mocked(f.cache.stats).mockResolvedValue({ bytes: 64, entries: 2, budgetBytes: 1024 });
  await f.session.refresh();
  expect(f.cache.stats).not.toHaveBeenCalled();
  await f.session.refreshCacheUsage();
  expect(f.session.getSnapshot().cacheUsage).toEqual({ bytes: 64, entries: 2, budgetBytes: 1024 });
  f.session.select(null);
  f.session.setScroll(42);
  await f.session.searchNow(true);
  await f.session.refresh();
  expect(f.cache.stats).toHaveBeenCalledOnce();
  vi.mocked(f.cache.clear).mockImplementation(async () => {
    vi.mocked(f.cache.stats).mockResolvedValue({ bytes: 0, entries: 0, budgetBytes: 1024 });
  });
  await f.session.clearCache();
  expect(f.cache.stats).toHaveBeenCalledTimes(2);
  expect(f.session.getSnapshot().cacheUsage).toEqual({ bytes: 0, entries: 0, budgetBytes: 1024 });
  f.session.dispose();
});

it('reports unknown cache usage without blocking local artwork after a statistics read failure', async () => {
  const f = fixture();
  await f.session.refresh();
  await f.session.importFiles([file('retained.svg', svg)]);
  await f.session.refreshCacheUsage();
  expect(f.session.getSnapshot().cacheUsage).not.toBeNull();
  vi.mocked(f.cache.stats).mockRejectedValue(new Error('Cache statistics unavailable.'));
  await f.session.refreshCacheUsage();
  expect(f.session.getSnapshot().cacheUsage).toBeNull();
  expect(f.session.getSnapshot().error).toBe(false);
  expect(f.session.getSnapshot().entries).toHaveLength(1);
  expect(f.session.getSnapshot().entries[0]?.definition).not.toBeNull();
  f.session.dispose();
});

it('ignores an older cache statistics result after clear publishes the current occupancy', async () => {
  const f = fixture();
  const old = deferred<{ bytes: number; entries: number; budgetBytes: number }>();
  vi.mocked(f.cache.stats)
    .mockImplementationOnce(() => old.promise)
    .mockResolvedValue({ bytes: 0, entries: 0, budgetBytes: 1024 });
  const pending = f.session.refreshCacheUsage();
  await f.session.clearCache();
  old.resolve({ bytes: 64, entries: 2, budgetBytes: 1024 });
  await pending;
  expect(f.session.getSnapshot().cacheUsage).toEqual({ bytes: 0, entries: 0, budgetBytes: 1024 });
  f.session.dispose();
});
