// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { deferred, fixture, reveal } from './session.test-support';
import type { EditorVectorCatalogPort } from './session';

function searchFixture() {
  const f = fixture();
  f.setSettings({ networkEnabled: true, disclosureAccepted: true });
  f.catalog.search = vi.fn(async () => ({
    source: f.source,
    data: {
      icons: Array.from({ length: 64 }, (_, index) => `test:icon${index}`),
      start: 0,
      limit: 64,
      collections: { test: { name: 'Test', total: 64 } },
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
  return f;
}

it('loads only visible cards and an explicitly selected card outside the viewport', async () => {
  const f = searchFixture();
  await f.session.refresh();
  f.session.setQuery('heart');
  await f.session.searchNow(true);
  expect(f.catalog.assets).not.toHaveBeenCalled();
  f.session.setVisibleEntries(['test:icon0', 'test:icon1']);
  await vi.waitFor(() => expect(f.session.getSnapshot().entries[1]?.definition).not.toBeNull());
  expect(vi.mocked(f.catalog.assets).mock.calls.flatMap((call) => call[1])).toEqual([
    'icon0',
    'icon1',
  ]);
  f.session.select('test:icon63');
  await vi.waitFor(() => expect(f.session.getSnapshot().entries[63]?.definition).not.toBeNull());
  expect(vi.mocked(f.catalog.assets).mock.calls.at(-1)?.[1]).toEqual(['icon63']);
  f.session.dispose();
});

it('limits batches to 32 names and two unsettled requests across overlap and canceled queries', async () => {
  const f = searchFixture();
  const releases = [deferred<void>(), deferred<void>()];
  const assets = f.catalog.assets;
  let active = 0;
  let peak = 0;
  f.catalog.assets = vi.fn(async (prefix, names, signal) => {
    const index = vi.mocked(f.catalog.assets).mock.calls.length - 1;
    active++;
    peak = Math.max(peak, active);
    await releases[index]?.promise;
    active--;
    return assets(prefix, names, signal);
  });
  await f.session.refresh();
  f.session.setQuery('heart');
  await f.session.searchNow(true);
  f.session.setVisibleEntries(f.session.getSnapshot().entries.map((entry) => entry.key));
  await vi.waitFor(() => expect(f.catalog.assets).toHaveBeenCalledTimes(2));
  f.session.setVisibleEntries(f.session.getSnapshot().entries.map((entry) => entry.key));
  expect(f.catalog.assets).toHaveBeenCalledTimes(2);
  f.session.setQuery('star');
  await f.session.searchNow(true);
  f.session.setVisibleEntries(['test:icon0']);
  expect(f.catalog.assets).toHaveBeenCalledTimes(2);
  releases[0]!.resolve();
  releases[1]!.resolve();
  await vi.waitFor(() => expect(f.session.getSnapshot().entries[0]?.definition).not.toBeNull());
  expect(peak).toBe(2);
  expect(vi.mocked(f.catalog.assets).mock.calls.every((call) => call[1].length <= 32)).toBe(true);
  expect(f.session.getSnapshot().entries[1]?.definition).toBeNull();
  f.session.dispose();
});

it('shares one pending search intent across repeated submission and unchanged filters', async () => {
  const f = searchFixture();
  const release = deferred<void>();
  const search = f.catalog.search;
  f.catalog.search = vi.fn(async (input, signal) => {
    await release.promise;
    return search(input, signal);
  });
  await f.session.refresh();
  f.session.setQuery('heart');
  const pending = f.session.searchNow(true);
  expect(f.session.searchNow(true)).toBe(pending);
  f.session.setFilter('catalog');
  release.resolve();
  await pending;
  expect(f.catalog.search).toHaveBeenCalledOnce();
  await reveal(f.session);
  f.session.dispose();
});

it('expands search metadata once after explicit demand and pages it locally without artwork requests', async () => {
  const f = searchFixture();
  f.catalog.search = vi.fn(async (input) => ({
    source: f.source,
    data: {
      icons: Array.from(
        { length: input.limit === 999 ? 200 : 64 },
        (_, index) => `test:icon${index}`
      ),
      start: 0,
      limit: input.limit ?? 64,
      collections: { test: { name: 'Test', total: 200 } },
    },
  }));
  await f.session.refresh();
  f.session.setQuery('heart');
  await f.session.searchNow(true);
  expect(f.catalog.search).toHaveBeenCalledOnce();
  expect(f.session.getSnapshot().entries).toHaveLength(64);
  await f.session.loadMore();
  expect(vi.mocked(f.catalog.search).mock.calls[1]?.[0]).toMatchObject({ start: 0, limit: 999 });
  expect(f.session.getSnapshot().entries).toHaveLength(128);
  await f.session.loadMore();
  expect(f.session.getSnapshot().entries).toHaveLength(192);
  await f.session.loadMore();
  expect(f.session.getSnapshot().entries).toHaveLength(200);
  expect(f.session.getSnapshot().hasMore).toBe(false);
  expect(f.catalog.search).toHaveBeenCalledTimes(2);
  expect(f.catalog.assets).not.toHaveBeenCalled();
  f.session.dispose();
});

it('keeps visible artwork alive when expansion returns the same 64 result keys', async () => {
  const f = searchFixture();
  const entered = deferred<void>();
  const release = deferred<void>();
  const assets = f.catalog.assets;
  f.catalog.assets = vi.fn(async (prefix, names, signal) => {
    entered.resolve();
    await release.promise;
    return assets(prefix, names, signal);
  });
  await f.session.refresh();
  f.session.setQuery('heart');
  await f.session.searchNow(true);
  f.session.setVisibleEntries(['test:icon0']);
  await entered.promise;
  const signal = vi.mocked(f.catalog.assets).mock.calls[0]?.[2];
  await f.session.loadMore();
  expect(f.session.getSnapshot().entries).toHaveLength(64);
  expect(f.session.getSnapshot().hasMore).toBe(false);
  release.resolve();
  await vi.waitFor(() => expect(f.session.getSnapshot().entries[0]?.definition).not.toBeNull());
  expect(signal?.aborted).toBe(false);
  expect(f.catalog.assets).toHaveBeenCalledOnce();
  f.session.dispose();
});
