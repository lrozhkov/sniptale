import { beforeEach, expect, it, vi } from 'vitest';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { loadSyncCatalogCache, replaceSyncCatalogCache } from './catalog-cache';

const io = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', () => ({ initDB: io.database }));
beforeEach(() => vi.clearAllMocks());

function setup() {
  const profile = {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 7,
    enabled: true,
    spaceId: 'space',
    connectionGeneration: 3,
  };
  const rows = new Map<string, Map<string, unknown>>([
    ['sync_capture', new Map([['profile', profile]])],
    ['sync_catalog_cache', new Map()],
  ]);
  let failWrite = false;
  const writes = vi.fn();
  const transactions = vi.fn((names: string[], mode: string) => {
    const pending = structuredClone(rows);
    let aborted = false;
    return {
      abort() {
        aborted = true;
      },
      objectStore(name: string) {
        if (!names.includes(name)) throw new Error('Store outside transaction');
        const store = pending.get(name)!;
        function checkWrite() {
          expect(mode).toBe('readwrite');
          expect(name).toBe('sync_catalog_cache');
          writes();
        }
        return {
          get: async (key: string): Promise<unknown> => structuredClone(store.get(key)),
          clear: async () => {
            checkWrite();
            store.clear();
          },
          put: async (value: unknown) => {
            checkWrite();
            if (failWrite) throw new DOMException('No space', 'QuotaExceededError');
            if (!isRecord(value) || typeof value['key'] !== 'string')
              throw new Error('Missing row key');
            store.set(value['key'], structuredClone(value));
          },
        };
      },
      get done() {
        if (aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
        if (mode === 'readwrite') for (const name of names) rows.set(name, pending.get(name)!);
        return Promise.resolve();
      },
    };
  });
  const database = { transaction: transactions };
  io.database.mockResolvedValue(database);
  return {
    profile,
    rows,
    database,
    writes,
    transactions,
    fail: (value: boolean) => {
      failWrite = value;
    },
  };
}

function manifest(text = '{}', manifestKey = 'manifests/test.json') {
  return { manifestKey, size: new TextEncoder().encode(text).byteLength, text };
}

it('reads a missing cache without writes and persists only exact detached raw entries', async () => {
  const fixture = setup();
  expect(await loadSyncCatalogCache('space', 3)).toEqual({ profileCreatedAt: 7, manifests: [] });
  expect(fixture.writes).not.toHaveBeenCalled();
  const entry = manifest('é');
  const replacement = replaceSyncCatalogCache('space', 3, 7, [entry]);
  entry.text = 'changed';
  expect(await replacement).toBe(true);
  expect(await loadSyncCatalogCache('space', 3)).toEqual({
    profileCreatedAt: 7,
    manifests: [manifest('é')],
  });
  const snapshot = fixture.rows.get('sync_catalog_cache')!;
  expect(snapshot.size).toBe(1);
  expect(snapshot.get('active')).toEqual({
    version: 1,
    key: 'active',
    spaceId: 'space',
    connectionGeneration: 3,
    profileCreatedAt: 7,
    manifests: [manifest('é')],
  });
  expect(fixture.rows.get('sync_capture')!.get('profile')).toEqual(fixture.profile);
});

it('parallel replacement keeps one complete advisory snapshot and leaves native authority unchanged', async () => {
  const fixture = setup();
  const nativeBefore = structuredClone(fixture.rows.get('sync_capture'));
  let release!: (value: typeof fixture.database) => void;
  io.database.mockReturnValueOnce(
    new Promise((resolve) => {
      release = resolve;
    })
  );
  const first = replaceSyncCatalogCache('space', 3, 7, [manifest('first')]);
  expect(await replaceSyncCatalogCache('space', 3, 7, [manifest('second')])).toBe(true);
  expect((await loadSyncCatalogCache('space', 3))?.manifests).toEqual([manifest('second')]);
  expect(fixture.rows.get('sync_capture')).toEqual(nativeBefore);
  release(fixture.database);
  expect(await first).toBe(true);
  expect(fixture.rows.get('sync_catalog_cache')!.size).toBe(1);
  expect((await loadSyncCatalogCache('space', 3))?.manifests).toEqual([manifest('first')]);
  expect(fixture.rows.get('sync_capture')).toEqual(nativeBefore);
});

it.each(['removed', 'disabled', 'space', 'generation', 'recreated'])(
  'refuses delayed replacement after profile is %s',
  async (change) => {
    const fixture = setup();
    let release!: (value: typeof fixture.database) => void;
    io.database.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      })
    );
    const late = replaceSyncCatalogCache('space', 3, 7, [manifest('late')]);
    const store = fixture.rows.get('sync_capture')!;
    if (change === 'removed') store.delete('profile');
    else
      store.set('profile', {
        ...fixture.profile,
        ...(change === 'disabled' ? { enabled: false } : {}),
        ...(change === 'space' ? { spaceId: 'other' } : {}),
        ...(change === 'generation' ? { connectionGeneration: 4 } : {}),
        ...(change === 'recreated' ? { createdAt: 8 } : {}),
      });
    release(fixture.database);
    expect(await late).toBe(false);
    expect(fixture.rows.get('sync_catalog_cache')!.size).toBe(0);
    expect(fixture.writes).not.toHaveBeenCalled();
    if (change === 'recreated') {
      expect(await loadSyncCatalogCache('space', 3)).toEqual({
        profileCreatedAt: 8,
        manifests: [],
      });
      expect(await replaceSyncCatalogCache('space', 3, 8, [manifest('new')])).toBe(true);
    } else expect(await loadSyncCatalogCache('space', 3)).toBeNull();
  }
);

it('failed transaction preserves the previous snapshot and permits an explicit retry', async () => {
  const fixture = setup();
  expect(await replaceSyncCatalogCache('space', 3, 7, [manifest('old')])).toBe(true);
  fixture.fail(true);
  expect(await replaceSyncCatalogCache('space', 3, 7, [manifest('new')])).toBe(false);
  expect((await loadSyncCatalogCache('space', 3))?.manifests).toEqual([manifest('old')]);
  fixture.fail(false);
  expect(await replaceSyncCatalogCache('space', 3, 7, [manifest('new')])).toBe(true);
  expect((await loadSyncCatalogCache('space', 3))?.manifests).toEqual([manifest('new')]);
});

it('cache IO refusal remains fail-soft while malformed native authority still fails', async () => {
  const fixture = setup();
  io.database.mockRejectedValueOnce(new Error('Unavailable'));
  expect(await loadSyncCatalogCache('space', 3)).toBeNull();
  io.database.mockRejectedValueOnce(new Error('Unavailable'));
  expect(await replaceSyncCatalogCache('space', 3, 7, [manifest()])).toBe(false);
  fixture.rows.get('sync_capture')!.set('profile', { kind: 'profile', broken: true });
  await expect(loadSyncCatalogCache('space', 3)).rejects.toThrow('Invalid sync capture profile.');
  await expect(replaceSyncCatalogCache('space', 3, 7, [])).rejects.toThrow(
    'Invalid sync capture profile.'
  );
});

it('rejects invalid input scopes and bounded-entry violations before IO', async () => {
  const fixture = setup();
  const oversized = 'x'.repeat(4 * 1024 * 1024 + 1);
  const invalid = [
    [manifest('', '../invalid')],
    [manifest('', 'a//b')],
    [manifest('', 'a?b')],
    ...[0, 31, 127].map((code) => [manifest('', `m/${String.fromCharCode(code)}`)]),
    [manifest('', 'a\\b')],
    [manifest('', 'x'.repeat(2049))],
    [{ ...manifest('é'), size: 1 }],
    [{ ...manifest(), size: Number.NaN }],
    [{ ...manifest(), credentials: 'forbidden' }],
    [manifest(oversized)],
    [manifest(), manifest()],
    Array.from({ length: 10_001 }, (_, index) => manifest('', `m/${index}`)),
  ];
  for (const entries of invalid)
    expect(await replaceSyncCatalogCache('space', 3, 7, entries)).toBe(false);
  const fullItem = 'x'.repeat(4 * 1024 * 1024);
  expect(
    await replaceSyncCatalogCache(
      'space',
      3,
      7,
      Array.from({ length: 16 }, (_, index) => manifest(fullItem, `m/${index}`))
    )
  ).toBe(false);
  for (const [space, generation, createdAt] of [
    ['', 3, 7],
    ['space', 0, 7],
    ['space', 1.1, 7],
    ['space', 3, -1],
  ] as const) {
    expect(await replaceSyncCatalogCache(space, generation, createdAt, [])).toBe(false);
  }
  expect(await loadSyncCatalogCache('', 3)).toBeNull();
  expect(await loadSyncCatalogCache('space', 0)).toBeNull();
  expect(fixture.transactions).not.toHaveBeenCalled();
});

it('admits the count and item boundaries without retaining previous snapshots', async () => {
  const fixture = setup();
  expect(
    await replaceSyncCatalogCache(
      'space',
      3,
      7,
      Array.from({ length: 10_000 }, (_, index) => manifest('', `m/${index}`))
    )
  ).toBe(true);
  expect(
    await replaceSyncCatalogCache('space', 3, 7, [manifest('x'.repeat(4 * 1024 * 1024))])
  ).toBe(true);
  expect(fixture.rows.get('sync_catalog_cache')!.size).toBe(1);
  expect((await loadSyncCatalogCache('space', 3))?.manifests).toHaveLength(1);
});

it('treats unknown malformed or incompatible cache storage as an empty write-free cache', async () => {
  const fixture = setup();
  await replaceSyncCatalogCache('space', 3, 7, [manifest()]);
  const store = fixture.rows.get('sync_catalog_cache')!;
  const valid = store.get('active');
  if (!isRecord(valid)) throw new Error('Expected fixture snapshot');
  const invalid: unknown[] = [
    null,
    'invalid',
    { ...valid, version: 2 },
    { ...valid, key: 'other' },
    { ...valid, spaceId: 'other' },
    { ...valid, connectionGeneration: 4 },
    { ...valid, profileCreatedAt: 8 },
    { ...valid, manifests: [{}] },
    { ...valid, manifests: [{ ...manifest(), size: 99 }] },
    { ...valid, manifests: [manifest(), manifest()] },
    { ...valid, heads: [] },
  ];
  fixture.writes.mockClear();
  for (const raw of invalid) {
    store.set('active', raw);
    expect(await loadSyncCatalogCache('space', 3)).toEqual({ profileCreatedAt: 7, manifests: [] });
    expect(store.get('active')).toEqual(raw);
  }
  expect(fixture.writes).not.toHaveBeenCalled();
});

it('publishes and reloads 10000 nonempty manifest entries without changing native authority', async () => {
  const fixture = setup();
  const before = structuredClone(fixture.rows.get('sync_capture'));
  const payload = JSON.stringify({ description: 'metadata'.repeat(400), version: 1 });
  const entries = Array.from({ length: 10_000 }, (_, index) =>
    manifest(payload, `manifests/${index}.json`)
  );
  expect(await replaceSyncCatalogCache('space', 3, 7, entries)).toBe(true);
  expect(await loadSyncCatalogCache('space', 3)).toEqual({
    profileCreatedAt: 7,
    manifests: entries,
  });
  expect(fixture.rows.get('sync_capture')).toEqual(before);
  expect(fixture.rows.get('sync_catalog_cache')!.size).toBe(1);
  fixture.writes.mockClear();
  expect(await replaceSyncCatalogCache('space', 3, 7, [...entries, manifest('overflow')])).toBe(
    false
  );
  expect(fixture.writes).not.toHaveBeenCalled();
  expect((await loadSyncCatalogCache('space', 3))?.manifests).toEqual(entries);
});
