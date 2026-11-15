// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { EditorVectorCatalogError } from '../../../features/editor/vector-catalog';
import { EditorVectorCatalogPreparation } from './catalog-preparation';
import { deferred, fixture } from './session.test-support';

const info = { name: 'Test', total: 1, author: { name: 'Artist' }, license: { title: 'MIT' } };

it('prepares search artwork with embedded attribution without requesting collection manifests', async () => {
  const f = fixture();
  f.catalog.search = vi.fn(async () => ({
    source: f.source,
    data: {
      icons: ['test:new'],
      start: 0,
      limit: 64,
      collections: { test: info },
    },
  }));
  const preparation = new EditorVectorCatalogPreparation({
    cache: f.cache,
    catalog: f.catalog,
    definitions: new Map(),
    source: () => f.source,
    currentSource: () => true,
    isAlive: () => true,
    admitNetwork: () => {},
  });
  const signal = new AbortController().signal;
  await preparation.searchPage('heart', undefined, 0, signal);
  const prepared = await preparation.prepareRemote('test', ['new'], signal);
  expect(f.catalog.collection).not.toHaveBeenCalled();
  expect(f.catalog.collections).not.toHaveBeenCalled();
  expect(prepared.set.author).toBe('Artist');
  expect(prepared.set.license).toBe('MIT');
});

function preparationFixture() {
  const f = fixture();
  const rows = new Map<string, unknown>();
  vi.mocked(f.cache.read).mockImplementation(async (key) => rows.get(JSON.stringify(key)) ?? null);
  vi.mocked(f.cache.put).mockImplementation(async (key, value) => {
    rows.set(JSON.stringify(key), value);
    return true;
  });
  const preparation = new EditorVectorCatalogPreparation({
    cache: f.cache,
    catalog: f.catalog,
    definitions: new Map(),
    source: () => f.source,
    currentSource: () => true,
    isAlive: () => true,
    admitNetwork: () => {},
  });
  return { ...f, preparation };
}

it('shares collection metadata across concurrent consumers and reuses its persisted response', async () => {
  const f = preparationFixture();
  await Promise.all([f.preparation.collections(), f.preparation.collections()]);
  await f.preparation.collections();
  expect(f.catalog.collections).toHaveBeenCalledOnce();
});

it('loads one collection manifest and reuses its attribution for every geometry batch', async () => {
  const f = preparationFixture();
  f.catalog.collection = vi.fn(async () => ({
    source: f.source,
    data: {
      prefix: 'test',
      uncategorized: ['new'],
      info,
    },
  }));
  const signal = new AbortController().signal;
  const first = await f.preparation.searchPage('', 'test', 0, signal);
  expect(first.icons).toEqual(['test:new']);
  await f.preparation.prepareRemote('test', ['new'], signal);
  await f.preparation.prepareRemote('test', ['new'], signal);
  await f.preparation.searchPage('', 'test', 0, signal);
  expect(f.catalog.collection).toHaveBeenCalledOnce();
  expect(f.catalog.collections).not.toHaveBeenCalled();
});

it('suppresses repeated failed manifest requests without blocking healthy search', async () => {
  const f = preparationFixture();
  f.catalog.collection = vi.fn(async () => {
    throw new EditorVectorCatalogError('network-failed');
  });
  const signal = new AbortController().signal;
  await expect(f.preparation.searchPage('', 'test', 0, signal)).rejects.toMatchObject({
    code: 'network-failed',
  });
  await expect(f.preparation.searchPage('', 'test', 0, signal)).rejects.toMatchObject({
    code: 'network-failed',
  });
  expect(f.catalog.collection).toHaveBeenCalledOnce();
  await expect(f.preparation.searchPage('heart', undefined, 0, signal)).resolves.toMatchObject({
    icons: [],
  });
  expect(f.catalog.search).toHaveBeenCalledOnce();
  expect(f.dependencies.downloads.begin).not.toHaveBeenCalled();
});

it('does not begin a download when the complete collection manifest is unavailable', async () => {
  const f = fixture();
  f.setSettings({ networkEnabled: true, disclosureAccepted: true });
  await f.session.refresh();
  f.catalog.collection = vi.fn(async () => {
    throw new EditorVectorCatalogError('network-failed');
  });
  await f.session.downloadCollection('test');
  await f.session.downloadCollection('test');
  expect(f.catalog.collection).toHaveBeenCalledOnce();
  expect(f.dependencies.downloads.begin).not.toHaveBeenCalled();
  expect(f.session.getSnapshot().download?.status).not.toBe('ready');
  expect(f.session.getSnapshot().error).toBe(true);
  f.session.dispose();
});

it('does not cache cancellation or permission refusal as a failed manifest', async () => {
  const f = preparationFixture();
  f.catalog.collection = vi
    .fn()
    .mockRejectedValueOnce(new EditorVectorCatalogError('canceled'))
    .mockRejectedValueOnce(new EditorVectorCatalogError('permission-required'))
    .mockResolvedValue({
      source: f.source,
      data: { prefix: 'test', uncategorized: ['new'], info },
    });
  const signal = new AbortController().signal;
  await expect(f.preparation.collection('test', signal)).rejects.toMatchObject({
    code: 'canceled',
  });
  await expect(f.preparation.collection('test', signal)).rejects.toMatchObject({
    code: 'permission-required',
  });
  await expect(f.preparation.collection('test', signal)).resolves.toMatchObject({ names: ['new'] });
  expect(f.catalog.collection).toHaveBeenCalledTimes(3);
});

it('does not request fallback metadata after canceled artwork settles', async () => {
  const f = preparationFixture();
  const entered = deferred<void>();
  const release = deferred<void>();
  const assets = f.catalog.assets;
  f.catalog.assets = vi.fn(async (prefix, names, signal) => {
    entered.resolve();
    await release.promise;
    return assets(prefix, names, signal);
  });
  const controller = new AbortController();
  const prepared = vi.fn();
  const pending = f.preparation.previews(
    f.source,
    [{ key: 'test:new', name: 'new', prefix: 'test' }],
    {
      signal: controller.signal,
      isCurrent: () => !controller.signal.aborted,
      prepared,
      refused: vi.fn(),
      failed: vi.fn(),
    }
  );
  await entered.promise;
  controller.abort();
  release.resolve();
  await pending;
  expect(f.catalog.collections).not.toHaveBeenCalled();
  expect(f.catalog.collection).not.toHaveBeenCalled();
  expect(prepared).not.toHaveBeenCalled();
});

it(
  'refreshes a cached manifest only on explicit checks, ' +
    'coalesces checks and honors the five minute cooldown',
  async () => {
    const f = preparationFixture();
    let now = 1_000;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const signal = new AbortController().signal;
    try {
      f.catalog.collection = vi.fn(async () => ({
        source: f.source,
        data: { prefix: 'test', uncategorized: ['old'], info },
      }));
      expect((await f.preparation.collection('test', signal)).names).toEqual(['old']);
      const entered = deferred<void>();
      const release = deferred<void>();
      f.catalog.collection = vi.fn(async () => {
        entered.resolve();
        await release.promise;
        return { source: f.source, data: { prefix: 'test', uncategorized: ['new'], info } };
      });
      expect((await f.preparation.collection('test', signal)).names).toEqual(['old']);
      expect(f.catalog.collection).not.toHaveBeenCalled();
      const first = f.preparation.refreshCollection('test', signal);
      await entered.promise;
      const second = f.preparation.refreshCollection('test', signal);
      release.resolve();
      expect((await first).names).toEqual(['new']);
      expect((await second).names).toEqual(['new']);
      now += 5 * 60_000 - 1;
      expect((await f.preparation.refreshCollection('test', signal)).names).toEqual(['new']);
      expect(f.catalog.collection).toHaveBeenCalledOnce();
      now += 1;
      await f.preparation.refreshCollection('test', signal);
      expect(f.catalog.collection).toHaveBeenCalledTimes(2);
    } finally {
      clock.mockRestore();
      f.session.dispose();
    }
  }
);

it('does not mistake a concurrent cached manifest read for a fresh explicit check', async () => {
  const f = preparationFixture();
  const entered = deferred<void>();
  const release = deferred<void>();
  vi.mocked(f.cache.read).mockImplementation(async () => {
    entered.resolve();
    await release.promise;
    return { prefix: 'test', uncategorized: ['old'], info };
  });
  f.catalog.collection = vi.fn(async () => ({
    source: f.source,
    data: { prefix: 'test', uncategorized: ['added'], info },
  }));
  const signal = new AbortController().signal;
  const cached = f.preparation.collection('test', signal);
  await entered.promise;
  const fresh = f.preparation.refreshCollection('test', signal);
  release.resolve();
  expect((await cached).names).toEqual(['old']);
  expect((await fresh).names).toEqual(['added']);
  expect(f.catalog.collection).toHaveBeenCalledOnce();
  f.session.dispose();
});

it('keeps an explicit failed manifest check under cooldown without retrying or publishing', async () => {
  const f = preparationFixture();
  f.catalog.collection = vi.fn(async () => {
    throw new EditorVectorCatalogError('network-failed');
  });
  const signal = new AbortController().signal;
  await expect(f.preparation.refreshCollection('test', signal)).rejects.toMatchObject({
    code: 'network-failed',
  });
  await expect(f.preparation.refreshCollection('test', signal)).rejects.toMatchObject({
    code: 'network-failed',
  });
  expect(f.catalog.collection).toHaveBeenCalledOnce();
  expect(f.dependencies.downloads.begin).not.toHaveBeenCalled();
  f.session.dispose();
});
