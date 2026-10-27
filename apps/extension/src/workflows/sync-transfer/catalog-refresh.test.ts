import { beforeEach, expect, it, vi } from 'vitest';
import {
  loadSyncCatalogCache,
  replaceSyncCatalogCache,
  type CachedSyncManifest,
} from '../../composition/persistence/sync-catalog/catalog-cache';
import { refreshPersistedSyncCatalog } from './catalog-refresh';
import { createSyncAttempt, hashSyncText } from './wire-record';
import { SyncRemoteError, type SyncRemoteStore } from './remote-store';

vi.mock('../../composition/persistence/sync-catalog/catalog-cache', () => ({
  loadSyncCatalogCache: vi.fn(),
  replaceSyncCatalogCache: vi.fn(),
}));
let snapshot: CachedSyncManifest[];
beforeEach(() => {
  snapshot = [];
  vi.mocked(loadSyncCatalogCache)
    .mockReset()
    .mockImplementation(async () => ({
      profileCreatedAt: 123,
      manifests: snapshot,
    }));
  vi.mocked(replaceSyncCatalogCache)
    .mockReset()
    .mockImplementation(async (_, __, ___, rows) => {
      snapshot = [...rows];
      return true;
    });
});
async function fixture(
  operationId = 'parent',
  parents: string[] = [],
  attempt = 1,
  rootId = 'root'
) {
  return createSyncAttempt(
    JSON.stringify({
      format: 'sniptale-sync-operation',
      version: 1,
      spaceId: 'space',
      operationId,
      rootKind: 'media',
      rootId,
      kind: 'delete',
      parents,
      dependencies: [],
      envelope: null,
      objects: [],
    }),
    `00000000-0000-0000-0000-${String(attempt).padStart(12, '0')}`
  );
}
type Manifest = Awaited<ReturnType<typeof fixture>>;
function remoteStore(records: Manifest[]) {
  const data = new Map(records.map((item) => [item.recordKey, new Blob([item.recordText])]));
  const reads: string[] = [];
  const listings: string[] = [];
  const remote: SyncRemoteStore = {
    list: async (prefix) => {
      listings.push(prefix);
      return {
        objects: [...data].map(([key, body]) => ({ key, size: body.size })),
        prefixes: [],
        nextCursor: null,
      };
    },
    read: async (key) => {
      reads.push(key);
      const body = data.get(key);
      if (!body) throw new SyncRemoteError('missing');
      return body.stream();
    },
    stat: async () => {
      throw new Error('Metadata discovery must not stat media.');
    },
    write: async () => {
      throw new Error('Metadata discovery must not write remotely.');
    },
  };
  return { remote, data, reads, listings };
}
const refresh = (
  remote: SyncRemoteStore,
  bypassCache = false,
  signal = new AbortController().signal
) => refreshPersistedSyncCatalog(remote, 'space', 7, signal, { bypassCache });

it('lists fully for cold, warm and bypass refreshes and GETs only one added manifest', async () => {
  const first = await fixture();
  const io = remoteStore([first]);
  const cold = await refresh(io.remote);
  expect(io.reads).toEqual([first.recordKey]);
  expect(snapshot).toEqual([
    {
      manifestKey: first.recordKey,
      size: new Blob([first.recordText]).size,
      text: first.recordText,
    },
  ]);
  io.reads.length = 0;
  expect(await refresh(io.remote)).toEqual(cold);
  expect(io.reads).toEqual([]);
  expect(loadSyncCatalogCache).toHaveBeenLastCalledWith('space', 7);
  expect(replaceSyncCatalogCache).toHaveBeenLastCalledWith('space', 7, 123, snapshot);
  const child = await fixture('child', ['parent'], 2);
  io.data.set(child.recordKey, new Blob([child.recordText]));
  expect((await refresh(io.remote)).operations.size).toBe(2);
  expect(io.reads).toEqual([child.recordKey]);
  io.reads.length = 0;
  expect((await refresh(io.remote, true)).operations.size).toBe(2);
  expect(io.reads).toEqual([first.recordKey, child.recordKey]);
  expect(io.listings).toEqual(Array(4).fill(`.sniptale/${hashSyncText('space')}/records/`));
});

it('falls back for wrong cached size, exact bytes, key hash and wire parser refusal', async () => {
  const first = await fixture();
  const io = remoteStore([first]);
  await refresh(io.remote);
  const valid = snapshot[0]!;
  for (const corrupt of [
    { ...valid, size: valid.size + 1 },
    { ...valid, text: 'é'.repeat(valid.size) },
    { ...valid, text: valid.text.replace('parent', 'broken') },
    {
      ...valid,
      manifestKey: valid.manifestKey.replace(hashSyncText('space'), hashSyncText('foreign')),
    },
  ]) {
    snapshot = [corrupt];
    io.reads.length = 0;
    expect((await refresh(io.remote)).invalid).toEqual([]);
    expect(io.reads).toEqual([first.recordKey]);
  }
  const invalidText = valid.text.replace('sniptale-sync-attempt', 'unsupported-attempt!');
  const invalidKey = valid.manifestKey.replace(hashSyncText(valid.text), hashSyncText(invalidText));
  io.data.clear();
  io.data.set(invalidKey, new Blob([invalidText]));
  snapshot = [{ manifestKey: invalidKey, size: new Blob([invalidText]).size, text: invalidText }];
  io.reads.length = 0;
  expect((await refresh(io.remote)).invalid).toEqual([
    { key: invalidKey, code: 'invalid-manifest' },
  ]);
  expect(io.reads).toEqual([invalidKey]);
  expect(snapshot).toEqual([]);
});

it('omits deleted cached ancestors and quarantines contradictions in either order', async () => {
  const parent = await fixture();
  const child = await fixture('child', ['parent'], 2);
  const io = remoteStore([parent, child]);
  await refresh(io.remote);
  io.data.delete(parent.recordKey);
  io.reads.length = 0;
  const missing = await refresh(io.remote);
  expect(missing.pending).toEqual(['child']);
  expect(missing.operations.size).toBe(0);
  expect(io.reads).toEqual([]);
  expect(snapshot.map((entry) => entry.manifestKey)).toEqual([child.recordKey]);
  const contradictory = await fixture('parent', [], 3, 'different-root');
  for (const records of [
    [child, parent, contradictory],
    [contradictory, parent, child],
  ]) {
    io.data.clear();
    for (const record of records) io.data.set(record.recordKey, new Blob([record.recordText]));
    const result = await refresh(io.remote);
    expect(result.quarantined).toEqual(['parent']);
    expect(result.pending).toEqual(['child']);
    expect(result.operations.size).toBe(0);
  }
});

it('keeps successful scans independent of cache IO failure or scope refusal', async () => {
  const first = await fixture();
  const io = remoteStore([first]);
  for (const load of [
    async () => null,
    async () => {
      throw new Error('storage refused');
    },
  ]) {
    vi.mocked(loadSyncCatalogCache).mockImplementationOnce(load);
    expect((await refresh(io.remote)).operations.size).toBe(1);
    expect(replaceSyncCatalogCache).not.toHaveBeenCalled();
  }
  vi.mocked(replaceSyncCatalogCache).mockRejectedValueOnce(new Error('write refused'));
  expect((await refresh(io.remote)).operations.size).toBe(1);
  vi.mocked(replaceSyncCatalogCache).mockResolvedValueOnce(false);
  expect((await refresh(io.remote)).operations.size).toBe(1);
});

it('retains the previous snapshot after incomplete listing, cursor failure, cancellation or count limit', async () => {
  const first = await fixture();
  const io = remoteStore([first]);
  await refresh(io.remote);
  const previous = snapshot;
  const list = io.remote.list;
  for (const failure of ['missing', 'cursor', 'cancel', 'count'] as const) {
    vi.mocked(replaceSyncCatalogCache).mockClear();
    const controller = new AbortController();
    let page = 0;
    io.remote.list = async (prefix, options) => {
      if (failure === 'count')
        return {
          objects: Array.from({ length: 10001 }, (_, index) => ({ key: `bad-${index}`, size: 0 })),
          prefixes: [],
          nextCursor: null,
        };
      if (page++ === 0) return { ...(await list(prefix, options)), nextCursor: 'next' };
      if (failure === 'cancel') controller.abort();
      if (failure === 'cursor') return { objects: [], prefixes: [], nextCursor: 'next' };
      throw new SyncRemoteError('missing');
    };
    await expect(refresh(io.remote, false, controller.signal)).rejects.toThrow();
    expect(snapshot).toBe(previous);
    expect(replaceSyncCatalogCache).not.toHaveBeenCalled();
  }
});

it('counts cached bytes toward the unchanged total metadata limit', async () => {
  const first = await fixture();
  const io = remoteStore([first]);
  await refresh(io.remote);
  const cached = snapshot[0]!;
  const list = io.remote.list;
  io.remote.list = async (prefix, options) => ({
    ...(await list(prefix, options)),
    objects: [
      { key: 'x'.repeat(64 * 1024 * 1024 - cached.size - cached.manifestKey.length + 1), size: 0 },
      { key: cached.manifestKey, size: cached.size },
    ],
  });
  io.reads.length = 0;
  vi.mocked(replaceSyncCatalogCache).mockClear();
  await expect(refresh(io.remote)).rejects.toMatchObject({ code: 'metadata-limit' });
  expect(io.reads).toEqual([]);
  expect(replaceSyncCatalogCache).not.toHaveBeenCalled();
});

it('preserves page and item limits when a warm cache exists', async () => {
  const first = await fixture();
  const io = remoteStore([first]);
  await refresh(io.remote);
  const previous = snapshot;
  let page = 0;
  io.remote.list = async () => ({ objects: [], prefixes: [], nextCursor: String(++page) });
  vi.mocked(replaceSyncCatalogCache).mockClear();
  await expect(refresh(io.remote)).rejects.toMatchObject({ code: 'metadata-limit' });
  expect(page).toBe(1024);
  expect(snapshot).toBe(previous);
  expect(replaceSyncCatalogCache).not.toHaveBeenCalled();
  io.remote.list = async () => ({
    objects: [{ key: first.recordKey, size: 4 * 1024 * 1024 + 1 }],
    prefixes: [],
    nextCursor: null,
  });
  io.reads.length = 0;
  expect((await refresh(io.remote)).invalid).toEqual([
    { key: first.recordKey, code: 'invalid-manifest' },
  ]);
  expect(io.reads).toEqual([]);
  expect(snapshot).toEqual([]);
});

it('does not list or replace after cancellation while loading the cache', async () => {
  const io = remoteStore([await fixture()]);
  const controller = new AbortController();
  vi.mocked(loadSyncCatalogCache).mockImplementationOnce(async () => {
    controller.abort();
    return { profileCreatedAt: 123, manifests: [] };
  });
  await expect(refresh(io.remote, false, controller.signal)).rejects.toThrow();
  expect(io.listings).toEqual([]);
  expect(replaceSyncCatalogCache).not.toHaveBeenCalled();
});

it('checks UTF8 bytes rather than character count for a valid cached manifest', async () => {
  const first = await fixture('parent', [], 1, 'é');
  const io = remoteStore([first]);
  await refresh(io.remote);
  io.reads.length = 0;
  expect((await refresh(io.remote)).operations.size).toBe(1);
  expect(io.reads).toEqual([]);
  expect(snapshot[0]!.size).toBeGreaterThan(snapshot[0]!.text.length);
});

it('refuses a catalog result after cancellation during advisory cache replacement', async () => {
  const io = remoteStore([await fixture()]);
  const controller = new AbortController();
  let releaseReplacement: (accepted: boolean) => void = () => {};
  let replacementStarted: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    replacementStarted = resolve;
  });
  const replacement = new Promise<boolean>((resolve) => {
    releaseReplacement = resolve;
  });
  vi.mocked(replaceSyncCatalogCache).mockImplementationOnce(() => {
    replacementStarted();
    return replacement;
  });
  const pending = refresh(io.remote, false, controller.signal);
  await started;
  controller.abort();
  releaseReplacement(true);
  await expect(pending).rejects.toThrow();
});

it('retains the selected bypass policy while the cache load is pending', async () => {
  const first = await fixture();
  const io = remoteStore([first]);
  await refresh(io.remote);
  io.reads.length = 0;
  let releaseLoad: () => void = () => {};
  const loading = new Promise<void>((resolve) => {
    releaseLoad = resolve;
  });
  vi.mocked(loadSyncCatalogCache).mockImplementationOnce(async () => {
    await loading;
    return { profileCreatedAt: 123, manifests: snapshot };
  });
  const options = { bypassCache: true };
  const pending = refreshPersistedSyncCatalog(
    io.remote,
    'space',
    7,
    new AbortController().signal,
    options
  );
  options.bypassCache = false;
  releaseLoad();
  await pending;
  expect(io.reads).toEqual([first.recordKey]);
});

it('keeps overlapping refresh results bound to their own complete listings', async () => {
  const parent = await fixture();
  const child = await fixture('child', ['parent'], 2);
  const older = remoteStore([parent]);
  const newer = remoteStore([parent, child]);
  let releaseOlder: () => void = () => {};
  let olderStarted: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    releaseOlder = resolve;
  });
  const started = new Promise<void>((resolve) => {
    olderStarted = resolve;
  });
  const list = older.remote.list;
  older.remote.list = async (prefix, options) => {
    olderStarted();
    await gate;
    return list(prefix, options);
  };
  const pendingOlder = refresh(older.remote);
  await started;
  const newResult = await refresh(newer.remote);
  expect([...newResult.operations.keys()]).toEqual(['child', 'parent']);
  expect(snapshot.map((entry) => entry.manifestKey)).toEqual([parent.recordKey, child.recordKey]);
  releaseOlder();
  const oldResult = await pendingOlder;
  expect([...oldResult.operations.keys()]).toEqual(['parent']);
  expect([...newResult.operations.keys()]).toEqual(['child', 'parent']);
  expect(snapshot.map((entry) => entry.manifestKey)).toEqual([parent.recordKey]);
  expect(older.reads).toEqual([parent.recordKey]);
  expect(newer.reads).toEqual([parent.recordKey, child.recordKey]);
  expect(replaceSyncCatalogCache).toHaveBeenCalledTimes(2);
});

it('bypass detects a same-size remote rewrite that normal immutable cache hits cannot observe', async () => {
  const first = await fixture();
  const io = remoteStore([first]);
  const original = await refresh(io.remote);
  const changed = new Blob([`[${first.recordText.slice(1)}`]);
  expect(changed.size).toBe(new Blob([first.recordText]).size);
  io.data.set(first.recordKey, changed);
  io.reads.length = 0;
  expect(await refresh(io.remote)).toEqual(original);
  expect(io.reads).toEqual([]);
  const checked = await refresh(io.remote, true);
  expect(io.reads).toEqual([first.recordKey]);
  expect(checked.operations.size).toBe(0);
  expect(checked.invalid).toEqual([{ key: first.recordKey, code: 'invalid-manifest' }]);
});
