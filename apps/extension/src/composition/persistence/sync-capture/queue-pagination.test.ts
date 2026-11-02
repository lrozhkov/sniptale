import { createNativeCapture } from './test-support/frozen-snapshot-database';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import {
  createMediaLibraryEntry,
  createProjectAssetEntry,
  createVideoProjectEntry,
} from '../projects/index.test-support';
import { captureRootKey, type CapturedChange } from './contracts';
import {
  enqueueSyncQueueOperation,
  loadSyncQueue,
  loadSyncQueueOperation,
  loadSyncQueuePage,
} from './queue';
import { queueOperationKey, type SyncQueueScope } from './queue-model';
import { parseSyncCaptureRecord } from './guards';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { pendingCheckpointKey } from './contracts';
import type { SyncConnectionMetadata } from '../remote-connection/model';

const io = vi.hoisted(() => ({ database: vi.fn(), readFile: vi.fn() }));
vi.mock('../assets/opfs-store', () => ({ readAssetFile: io.readFile }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
}));
const scope: SyncQueueScope = { spaceId: 'space', connectionGeneration: 3, profileCreatedAt: 1 };
type Range = { lower: string; upper: string; lowerOpen: boolean };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IDBKeyRange', {
    only: (only: IDBValidKey) => ({ only }),
    bound: (lower: string, upper: string, lowerOpen = false, upperOpen = false) => ({
      lower,
      upper,
      lowerOpen,
      upperOpen,
    }),
  });
});
afterEach(() => vi.unstubAllGlobals());

function nativeKey(value: unknown): value is IDBValidKey {
  return (
    typeof value === 'string' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (Array.isArray(value) && value.every(nativeKey))
  );
}
function compareIndexKeys(left: IDBValidKey, right: IDBValidKey): number {
  if (Array.isArray(left) && Array.isArray(right)) {
    for (let i = 0; i < Math.min(left.length, right.length); i++) {
      const order = compareIndexKeys(left[i]!, right[i]!);
      if (order) return order;
    }
    return left.length - right.length;
  }
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  if (typeof left === 'string' && typeof right === 'string')
    return left < right ? -1 : left > right ? 1 : 0;
  const rank = (key: IDBValidKey) =>
    typeof key === 'number' ? 0 : typeof key === 'string' ? 1 : 2;
  return rank(left) - rank(right);
}
function matchesIndexQuery(key: IDBValidKey, query: unknown): boolean {
  if (query === undefined) return true;
  if (nativeKey(query)) return compareIndexKeys(key, query) === 0;
  if (!isRecord(query) || !nativeKey(query['lower']) || !nativeKey(query['upper'])) return false;
  const lower = compareIndexKeys(key, query['lower']);
  const upper = compareIndexKeys(key, query['upper']);
  return (
    (query['lowerOpen'] ? lower > 0 : lower >= 0) && (query['upperOpen'] ? upper < 0 : upper <= 0)
  );
}
async function setup(count: number, changes: CapturedChange['change'][] = []) {
  const fixture = createReviewWorkspaceStoreFixture(() => false);
  const table = (name: string) => fixture.rows.get(name)!;
  const getAll = vi.fn(async (range: Range, limit: number) =>
    structuredClone(
      [...table('sync_outbox')]
        .filter(
          ([key]) =>
            (range.lowerOpen ? key > range.lower : key >= range.lower) && key <= range.upper
        )
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .slice(0, limit)
        .map(([, value]) => value)
    )
  );
  const indexKeyPath = ['kind', 'status', 'spaceId', 'connectionGeneration', 'profileCreatedAt'];
  const index = {
    keyPath: indexKeyPath,
    count: vi.fn(async (range: { only: IDBValidKey }) => matchingKeys(range).length),
    openKeyCursor: vi.fn(async (range: { only: IDBValidKey }) => {
      const keys = matchingKeys(range);
      const cursorAt = (offset: number): unknown => {
        const primaryKey = keys[offset];
        return primaryKey === undefined
          ? null
          : {
              key: range.only,
              primaryKey,
              continue: async () => cursorAt(offset + 1),
              continuePrimaryKey: async (_key: IDBValidKey, target: string) =>
                cursorAt(keys.findIndex((key) => key >= target)),
            };
      };
      return cursorAt(0);
    }),
  };
  function matchingKeys(range: { only: IDBValidKey }) {
    return [...table('sync_outbox')]
      .filter(([, row]) => {
        if (typeof row !== 'object' || row === null) return false;
        const key = indexKeyPath.map((field) => Reflect.get(row, field));
        return JSON.stringify(key) === JSON.stringify(range.only);
      })
      .map(([key]) => key)
      .sort();
  }
  const pendingEntries = (query?: unknown) =>
    [...table('sync_capture')]
      .flatMap(([primaryKey, row]) => {
        if (!isRecord(row)) return [];
        const key = ['kind', 'spaceId', 'connectionGeneration', 'profileCreatedAt', 'dueAt'].map(
          (field) => row[field]
        );
        return nativeKey(key) && matchesIndexQuery(key, query) ? [{ key, primaryKey }] : [];
      })
      .sort((a, b) => compareIndexKeys(a.key, b.key) || a.primaryKey.localeCompare(b.primaryKey));
  const pendingIndex = {
    keyPath: ['kind', 'spaceId', 'connectionGeneration', 'profileCreatedAt', 'dueAt'],
    count: vi.fn(async (query?: unknown) => pendingEntries(query).length),
    openKeyCursor: vi.fn(async (query?: unknown) => pendingEntries(query)[0] ?? null),
  };
  const kindIndex = {
    keyPath: 'kind',
    count: vi.fn(
      async (query?: unknown) =>
        [...table('sync_capture').values()].filter(
          (row) =>
            isRecord(row) &&
            typeof row['kind'] === 'string' &&
            matchesIndexQuery(row['kind'], query)
        ).length
    ),
  };
  const captureIndexAccess = vi.fn((name: string) => (name === 'kind' ? kindIndex : pendingIndex));
  const indexAccess = vi.fn(() => index);
  const captureGet = vi.fn();
  const database = {
    transaction: vi.fn((stores: string[], mode: string) => {
      const tx = fixture.database.transaction(stores, mode);
      return {
        abort: tx.abort,
        objectStore(name: string) {
          const store = tx.objectStore(name);
          if (name === 'sync_capture')
            return {
              ...store,
              count: async () => table('sync_capture').size,
              index: captureIndexAccess,
              get(key: IDBValidKey) {
                captureGet(key);
                return store.get(key);
              },
            };
          return name === 'sync_outbox'
            ? {
                ...store,
                getAll,
                count: async (range: Range) =>
                  [...table('sync_outbox').keys()].filter(
                    (key) => key >= range.lower && key <= range.upper
                  ).length,
                index: indexAccess,
              }
            : store;
        },
        get done() {
          return tx.done;
        },
      };
    }),
  };
  io.database.mockResolvedValue(database);
  table('sync_capture').set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'space',
    connectionGeneration: 3,
  });
  const ids = Array.from({ length: count }, (_, i) => `operation-${String(i).padStart(4, '0')}`);
  for (const [index, id] of ids.entries()) {
    const change: CapturedChange['change'] = changes[index] ?? { kind: 'tombstone' };
    const rootKind = change.kind === 'video-project' ? 'video-project' : 'media';
    const rootId =
      change.kind === 'media'
        ? change.rows.media.id
        : change.kind === 'video-project'
          ? change.rows.project.id
          : 'root';
    const capture: CapturedChange = createNativeCapture({
      version: 1,
      kind: 'sync-operation',
      key: JSON.stringify(['change', id]),
      createdAt: index + 1,
      spaceId: 'space',
      connectionGeneration: 3,
      rootKind,
      rootId,
      rootKey: captureRootKey('space', rootKind, rootId),
      generation: 1,
      operationId: id,
      basis: [],
      origin: 'local-edit',
      publicationId: null,
      change,
    });
    table('sync_capture').set(capture.key, capture);
    await enqueueSyncQueueOperation(capture);
  }
  getAll.mockClear();
  captureGet.mockClear();
  database.transaction.mockClear();
  return {
    table,
    ids,
    database,
    getAll,
    captureGet,
    index,
    indexAccess,
    pendingIndex,
    captureIndexAccess,
    rows: fixture.rows,
  };
}
it('traverses a queue beyond the pilot bound with bounded exclusive pages and no writes', async () => {
  const f = await setup(137);
  const before = structuredClone(f.rows);
  const seen: string[] = [];
  let page = await loadSyncQueuePage(scope, { limit: 17 });
  for (;;) {
    seen.push(...page.operations.map((row) => row.operationId));
    expect(page.operations.length).toBeLessThanOrEqual(17);
    expect(page.sources.map((source) => source.operationId)).toEqual(
      page.operations.map((row) => row.operationId)
    );
    expect(page.sources.every((source) => source.label === 'root')).toBe(true);
    if (!page.nextCursor) break;
    page = await loadSyncQueuePage(scope, { limit: 17, cursor: page.nextCursor });
  }
  expect(seen).toEqual(f.ids);
  expect(new Set(seen).size).toBe(137);
  expect(f.getAll.mock.calls.every(([, limit]) => limit === 18)).toBe(true);
  expect(f.rows).toEqual(before);
  await expect(loadSyncQueue(scope)).rejects.toThrow('limit');
});
it('projects readable admitted media, project and tombstone metadata without file reads or writes', async () => {
  const projectAsset = createProjectAssetEntry();
  const media = createMediaLibraryEntry({ filename: '  Source image.png  ' });
  const project = createVideoProjectEntry({ name: '  Travel edit  ' });
  const f = await setup(3, [
    {
      kind: 'media',
      rows: {
        media,
        projectAsset,
        ref: {
          assetId: projectAsset.assetId,
          createdAt: 1,
          location: { kind: 'opfs', objectKey: `objects/${projectAsset.assetId}` },
          mimeType: projectAsset.mimeType,
          size: projectAsset.size,
          sha256: null,
        },
      },
    },
    { kind: 'video-project', rows: { project, assets: [], exports: [], media: [], refs: [] } },
  ]);
  const before = structuredClone(f.rows);
  const first = await loadSyncQueuePage(scope, { limit: 2 });
  expect(first.sources).toEqual([
    {
      operationId: f.ids[0],
      rootKind: 'media',
      rootId: media.id,
      changeKind: 'media',
      label: 'Source image.png',
      createdAt: 1,
    },
    {
      operationId: f.ids[1],
      rootKind: 'video-project',
      rootId: project.id,
      changeKind: 'video-project',
      label: 'Travel edit',
      createdAt: 2,
    },
  ]);
  expect(f.captureGet.mock.calls.map(([key]) => key)).toEqual([
    'profile',
    ...f.ids.map((id) => JSON.stringify(['change', id])),
  ]);
  const final = await loadSyncQueuePage(scope, { limit: 2, cursor: first.nextCursor });
  expect(final.sources).toEqual([
    {
      operationId: f.ids[2],
      rootKind: 'media',
      rootId: 'root',
      changeKind: 'tombstone',
      label: 'root',
      createdAt: 3,
    },
  ]);
  expect(final.nextCursor).toBeNull();
  expect(f.database.transaction.mock.calls).toEqual([
    [['sync_capture', 'sync_outbox'], 'readonly'],
    [['sync_capture', 'sync_outbox'], 'readonly'],
  ]);
  expect(io.readFile).not.toHaveBeenCalled();
  expect(f.rows).toEqual(before);
});
it.each(['   ', `  ${'旅行🎬'.repeat(200)}  `])(
  'preserves the complete trimmed source label or falls back to its identity for %s',
  async (name) => {
    const project = createVideoProjectEntry({ name });
    await setup(1, [
      { kind: 'video-project', rows: { project, assets: [], exports: [], media: [], refs: [] } },
    ]);
    const page = await loadSyncQueuePage(scope);
    expect(page.sources[0]?.label).toBe(name.trim() || project.id);
  }
);
it('reads one exact operation past 128 without scanning or admitting unrelated corrupt rows', async () => {
  const f = await setup(137);
  f.table('sync_outbox').set(queueOperationKey(scope, f.ids[0]!), { corrupt: true });
  expect(await loadSyncQueueOperation(scope, f.ids.at(-1)!)).toMatchObject({
    operationId: f.ids.at(-1),
  });
  expect(f.getAll).not.toHaveBeenCalled();
  await expect(loadSyncQueueOperation(scope, f.ids[0]!)).rejects.toThrow('Invalid');
});
it('refuses a changed retained capture for direct reads and pages without writes', async () => {
  const f = await setup(2);
  f.table('sync_capture').delete(JSON.stringify(['change', f.ids[0]]));
  const before = structuredClone(f.rows);
  await expect(loadSyncQueueOperation(scope, f.ids[0]!)).rejects.toThrow('capture changed');
  await expect(loadSyncQueuePage(scope)).rejects.toThrow('capture changed');
  expect(f.rows).toEqual(before);
});
it('refuses the whole page when the displayed suffix or lookahead capture join fails', async () => {
  const f = await setup(3);
  f.table('sync_capture').delete(JSON.stringify(['change', f.ids[2]]));
  const before = structuredClone(f.rows);
  await expect(loadSyncQueuePage(scope, { limit: 3 })).rejects.toThrow('capture changed');
  await expect(loadSyncQueuePage(scope, { limit: 2 })).rejects.toThrow('capture changed');
  expect(f.rows).toEqual(before);
});
it.each([0, -1, 129, 1.5, NaN, '2', null])(
  'refuses invalid page limit %s before storage',
  async (limit) => {
    await expect(loadSyncQueuePage(scope, { limit })).rejects.toThrow('limit');
    expect(io.database).not.toHaveBeenCalled();
  }
);
it.each([
  {},
  { scope, afterOperationId: '' },
  { scope: { ...scope, profileCreatedAt: 2 }, afterOperationId: 'x' },
  'x',
])('refuses an invalid or foreign cursor before storage', async (cursor) => {
  await expect(loadSyncQueuePage(scope, { cursor })).rejects.toThrow('cursor');
  expect(io.database).not.toHaveBeenCalled();
});
it('detaches the scope and cursor before delayed admission and refuses a recreated profile', async () => {
  const f = await setup(3);
  const first = await loadSyncQueuePage(scope, { limit: 1 });
  const cursor = structuredClone(first.nextCursor!);
  const selected = structuredClone(scope);
  let admit!: (value: typeof f.database) => void;
  io.database.mockReturnValueOnce(
    new Promise((resolve) => {
      admit = resolve;
    })
  );
  const pending = loadSyncQueuePage(selected, { cursor, limit: 1 });
  cursor.afterOperationId = 'wrong';
  selected.profileCreatedAt = 2;
  admit(f.database);
  expect((await pending).operations[0]!.operationId).toBe(f.ids[1]);
  f.table('sync_capture').set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 2,
    enabled: true,
    spaceId: 'space',
    connectionGeneration: 3,
  });
  const before = structuredClone(f.rows);
  await expect(loadSyncQueuePage(scope, { cursor: first.nextCursor })).rejects.toThrow(
    'profile changed'
  );
  await expect(loadSyncQueueOperation(scope, f.ids[0]!)).rejects.toThrow('profile changed');
  expect(f.rows).toEqual(before);
});
it('handles empty and exact final pages without a continuation', async () => {
  await setup(0);
  expect(await loadSyncQueuePage(scope)).toMatchObject({
    operations: [],
    sources: [],
    nextCursor: null,
  });
  await setup(2);
  expect(await loadSyncQueuePage(scope, { limit: 2 })).toMatchObject({ nextCursor: null });
});

function setStatus(f: Awaited<ReturnType<typeof setup>>, position: number, values: object) {
  const key = queueOperationKey(scope, f.ids[position]!);
  const current = f.table('sync_outbox').get(key);
  if (typeof current !== 'object' || current === null) throw new Error('Missing queue fixture.');
  f.table('sync_outbox').set(key, { ...current, ...values });
}
function setConnection(
  f: Awaited<ReturnType<typeof setup>>,
  incarnation = '11111111-1111-4111-8111-111111111111'
) {
  const metadata: SyncConnectionMetadata = {
    version: 1,
    kind: 'sync-connection',
    key: 'connection',
    binding: {
      ...scope,
      provider: 'webdav',
      rootUrl: 'https://example.test/dav/',
      accountId: 'account',
    },
    identity: { incarnation, revision: 1 },
    phase: 'active',
    updateNonce: null,
    credentialId: '22222222-2222-4222-8222-222222222222',
  };
  f.table('sync_connection').set('connection', metadata);
  return metadata;
}
it(
  'finds the only failed operation beyond 300 published operations without capture ' +
    'reads for rejected rows',
  async () => {
    const f = await setup(301);
    for (let i = 0; i < 300; i++) setStatus(f, i, { status: 'published', outcome: 'verified' });
    setStatus(f, 300, { status: 'failed', failureCode: 'authentication' });
    const page = await loadSyncQueuePage(scope, { limit: 25, filter: 'problems' });
    expect(page).toMatchObject({ problemCount: 1, nextCursor: null });
    expect(page.operations.map((row) => row.operationId)).toEqual([f.ids[300]]);
    expect(f.captureGet.mock.calls.map(([key]) => key)).toEqual([
      'profile',
      JSON.stringify(['change', f.ids[300]]),
    ]);
    expect(io.readFile).not.toHaveBeenCalled();
  }
);

it(
  'continues action search after 128 automatic retries before a manual refusal ' +
    'without declaring an empty global result',
  async () => {
    const f = await setup(130);
    for (let i = 0; i < 129; i++) {
      setStatus(f, i, {
        status: 'failed',
        failureCode: 'temporary',
        nextDueAt: 1,
        automaticRetryCount: 1,
      });
      // Rejected metadata must not require a surviving source join.
      f.table('sync_capture').delete(JSON.stringify(['change', f.ids[i]]));
    }
    setStatus(f, 129, { status: 'failed', failureCode: 'access-denied' });
    const before = structuredClone(f.rows);
    const first = await loadSyncQueuePage(scope, { filter: 'action-required', limit: 25 });
    expect(first).toMatchObject({
      operations: [],
      sources: [],
      problemCount: 130,
      nextCursor: { filter: 'action-required', status: 'failed', afterOperationId: f.ids[127] },
    });
    expect(f.captureGet.mock.calls.map(([key]) => key)).toEqual(['profile']);
    const next = await loadSyncQueuePage(scope, {
      filter: 'action-required',
      limit: 25,
      cursor: first.nextCursor,
    });
    expect(next.operations.map((row) => row.operationId)).toEqual([f.ids[129]]);
    expect(next.nextCursor).toBeNull();
    expect(f.captureGet.mock.calls.map(([key]) => key)).toEqual([
      'profile',
      'profile',
      JSON.stringify(['change', f.ids[129]]),
    ]);
    expect(f.rows).toEqual(before);
    expect(io.readFile).not.toHaveBeenCalled();
  }
);
it(
  'orders filtered pages by status and primary key without duplicates or skipped ' +
    'first keys when crossing buckets',
  async () => {
    const f = await setup(6);
    for (const i of [0, 2, 4])
      setStatus(f, i, {
        status: 'interrupted',
        failureCode: 'interrupted',
        automaticRetryCount: 5,
      });
    for (const i of [1, 3, 5]) setStatus(f, i, { status: 'failed', failureCode: 'source' });
    const ids: string[] = [];
    let page = await loadSyncQueuePage(scope, { filter: 'problems', limit: 1 });
    for (;;) {
      ids.push(...page.operations.map((row) => row.operationId));
      expect(page.problemCount).toBe(6);
      if (!page.nextCursor) break;
      page = await loadSyncQueuePage(scope, {
        filter: 'problems',
        limit: 1,
        cursor: page.nextCursor,
      });
    }
    expect(ids).toEqual([1, 3, 5, 0, 2, 4].map((i) => f.ids[i]));
    expect(new Set(ids).size).toBe(6);
  }
);
it(
  'distinguishes automatic recovery and uninitialized legacy retries from exhausted ' +
    'retries and manual failures',
  async () => {
    const f = await setup(10);
    setStatus(f, 0, {
      status: 'failed',
      failureCode: 'temporary',
      nextDueAt: 1,
      automaticRetryCount: 5,
    });
    setStatus(f, 1, {
      status: 'interrupted',
      failureCode: 'interrupted',
      nextDueAt: Date.now() + 30_000,
      automaticRetryCount: 1,
    });
    setStatus(f, 2, {
      status: 'failed',
      failureCode: 'temporary',
      nextDueAt: null,
      automaticRetryCount: 5,
    });
    setStatus(f, 3, { status: 'failed', failureCode: 'secrets-locked' });
    setStatus(f, 4, { status: 'paused', failureCode: 'authentication' });
    setStatus(f, 5, { status: 'running', runId: '33333333-3333-4333-8333-333333333333' });
    setStatus(f, 6, {
      status: 'failed',
      failureCode: 'temporary',
      nextDueAt: null,
      automaticRetryCount: 0,
    });
    setStatus(f, 7, { status: 'published', outcome: 'verified' });
    setStatus(f, 8, { status: 'cancelled' });
    const page = await loadSyncQueuePage(scope, { filter: 'action-required' });
    expect(page.operations.map((row) => row.operationId)).toEqual([f.ids[2], f.ids[3]]);
    expect(page.problemCount).toBe(5);
    expect(page.nextCursor).toBeNull();
  }
);
it('refuses a cursor from another filter or order before storage', async () => {
  const f = await setup(2);
  setStatus(f, 0, { status: 'failed', failureCode: 'authentication' });
  setStatus(f, 1, { status: 'failed', failureCode: 'source' });
  const first = await loadSyncQueuePage(scope, { filter: 'problems', limit: 1 });
  io.database.mockClear();
  await expect(
    loadSyncQueuePage(scope, { filter: 'action-required', cursor: first.nextCursor })
  ).rejects.toThrow('cursor');
  await expect(loadSyncQueuePage(scope, { cursor: first.nextCursor })).rejects.toThrow('cursor');
  await expect(
    loadSyncQueuePage(scope, {
      filter: 'problems',
      cursor: { ...first.nextCursor, order: 'primary-key' },
    })
  ).rejects.toThrow('cursor');
  await expect(loadSyncQueuePage(scope, { filter: 'bogus' })).rejects.toThrow('filter');
  expect(io.database).not.toHaveBeenCalled();
});
it(
  'refuses a retained cursor after same-scope connection replacement while retaining ' +
    'old failed operations in fresh queries',
  async () => {
    const f = await setup(2);
    const original = setConnection(f);
    for (const i of [0, 1])
      setStatus(f, i, {
        status: 'failed',
        failureCode: 'authentication',
        authorization: original.identity,
      });
    const first = await loadSyncQueuePage(scope, { filter: 'problems', limit: 1 });
    setConnection(f, '44444444-4444-4444-8444-444444444444');
    const before = structuredClone(f.rows);
    await expect(
      loadSyncQueuePage(scope, { filter: 'problems', cursor: first.nextCursor })
    ).rejects.toThrow('connection changed');
    const fresh = await loadSyncQueuePage(scope, { filter: 'problems' });
    expect(fresh.operations.map((row) => row.operationId)).toEqual(f.ids);
    expect(f.rows).toEqual(before);
  }
);
it('keeps a retained failed operation visible after a newer same-root publication', async () => {
  const f = await setup(2);
  setStatus(f, 0, { status: 'failed', failureCode: 'source', generation: 1 });
  const capture = parseSyncCaptureRecord(
    f.table('sync_capture').get(JSON.stringify(['change', f.ids[1]]))
  );
  if (capture?.kind !== 'sync-operation' || capture.phase !== 'native')
    throw new Error('Missing capture.');
  const newer = createNativeCapture({ ...capture, generation: 2 });
  f.table('sync_capture').set(newer.key, newer);
  setStatus(f, 1, {
    status: 'published',
    outcome: 'verified',
    generation: 2,
    captureSha256: newer.sourceSha256,
  });
  const page = await loadSyncQueuePage(scope, { filter: 'problems' });
  expect(page.operations.map((row) => row.operationId)).toEqual([f.ids[0]]);
  expect(page.problemCount).toBe(1);
});
it('rejects missing index coverage and metadata read failures instead of reporting zero problems', async () => {
  const f = await setup(1);
  const before = structuredClone(f.rows);
  f.indexAccess.mockImplementationOnce(() => {
    throw new DOMException('Index missing', 'NotFoundError');
  });
  await expect(loadSyncQueuePage(scope, { filter: 'problems' })).rejects.toThrow('Index missing');
  f.index.keyPath = [];
  await expect(loadSyncQueuePage(scope, { filter: 'problems' })).rejects.toThrow('index');
  f.index.keyPath = ['kind', 'status', 'spaceId', 'connectionGeneration', 'profileCreatedAt'];
  f.index.count.mockRejectedValueOnce(new Error('Storage unavailable'));
  await expect(loadSyncQueuePage(scope, { filter: 'problems' })).rejects.toThrow(
    'Storage unavailable'
  );
  setStatus(f, 0, { status: 'unrecognized' });
  await expect(loadSyncQueuePage(scope, { filter: 'problems' })).rejects.toThrow('coverage');
  expect(f.table('sync_capture')).toEqual(before.get('sync_capture'));
});
it('binds explicit all cursors to connection identity while preserving primary key ordering', async () => {
  const f = await setup(3);
  setConnection(f);
  const first = await loadSyncQueuePage(scope, { filter: 'all', limit: 1 });
  expect(first.nextCursor).toMatchObject({
    filter: 'all',
    order: 'primary-key',
    afterOperationId: f.ids[0],
  });
  const second = await loadSyncQueuePage(scope, {
    filter: 'all',
    limit: 1,
    cursor: first.nextCursor,
  });
  expect(second.operations[0]?.operationId).toBe(f.ids[1]);
  setConnection(f, '44444444-4444-4444-8444-444444444444');
  await expect(
    loadSyncQueuePage(scope, { filter: 'all', cursor: second.nextCursor })
  ).rejects.toThrow('connection changed');
});

it('detaches a filtered selection before delayed admission and refuses a recreated enrollment', async () => {
  const f = await setup(3);
  for (const i of [0, 1, 2]) setStatus(f, i, { status: 'failed', failureCode: 'authentication' });
  const first = await loadSyncQueuePage(scope, { filter: 'problems', limit: 1 });
  const cursor = structuredClone(first.nextCursor!);
  const options = { filter: 'problems', limit: 1, cursor };
  let admit!: (value: typeof f.database) => void;
  io.database.mockReturnValueOnce(
    new Promise((resolve) => {
      admit = resolve;
    })
  );
  const pending = loadSyncQueuePage(scope, options);
  options.filter = 'action-required';
  cursor.afterOperationId = f.ids[2]!;
  admit(f.database);
  expect((await pending).operations[0]?.operationId).toBe(f.ids[1]);
  io.database.mockReturnValueOnce(
    new Promise((resolve) => {
      admit = resolve;
    })
  );
  const stale = loadSyncQueuePage(scope, { filter: 'problems', cursor: first.nextCursor });
  const profile = f.table('sync_capture').get('profile');
  if (typeof profile !== 'object' || profile === null) throw new Error('Missing profile.');
  f.table('sync_capture').set('profile', { ...profile, createdAt: 2 });
  const before = structuredClone(f.rows);
  admit(f.database);
  await expect(stale).rejects.toThrow('profile changed');
  expect(f.rows).toEqual(before);
});
it('does not count or read failures from another enrollment scope', async () => {
  const f = await setup(2);
  setStatus(f, 0, { status: 'failed', failureCode: 'source' });
  const original = f.table('sync_outbox').get(queueOperationKey(scope, f.ids[0]!));
  if (typeof original !== 'object' || original === null) throw new Error('Missing operation.');
  const foreign = { ...scope, profileCreatedAt: 9 };
  f.table('sync_outbox').set(queueOperationKey(foreign, 'foreign'), {
    ...original,
    ...foreign,
    key: queueOperationKey(foreign, 'foreign'),
    operationId: 'foreign',
  });
  const page = await loadSyncQueuePage(scope, { filter: 'problems' });
  expect(page.problemCount).toBe(1);
  expect(page.operations.map((row) => row.operationId)).toEqual([f.ids[0]]);
  expect(f.captureGet.mock.calls.map(([key]) => key)).toEqual([
    'profile',
    JSON.stringify(['change', f.ids[0]]),
  ]);
});

it(
  'keeps a scheduled failure actionable after connection incarnation replacement but ' +
    'preserves automatic recovery after credential revision changes',
  async () => {
    const f = await setup(1);
    const original = setConnection(f);
    setStatus(f, 0, {
      status: 'failed',
      failureCode: 'temporary',
      nextDueAt: 1,
      automaticRetryCount: 1,
      authorization: original.identity,
    });
    f.table('sync_connection').set('connection', {
      ...original,
      identity: { ...original.identity, revision: original.identity.revision + 1 },
    });
    expect((await loadSyncQueuePage(scope, { filter: 'action-required' })).operations).toEqual([]);
    setConnection(f, '44444444-4444-4444-8444-444444444444');
    const page = await loadSyncQueuePage(scope, { filter: 'action-required' });
    expect(page.operations.map((row) => row.operationId)).toEqual(f.ids);
    expect(page.problemCount).toBe(1);
  }
);

function pendingCheckpoint(
  f: Awaited<ReturnType<typeof setup>>,
  id: string,
  dueAt: unknown,
  selected = scope
) {
  const rootKey = captureRootKey(selected.spaceId, 'media', id);
  const key = pendingCheckpointKey(rootKey);
  f.table('sync_capture').set(key, {
    ...selected,
    version: 1,
    kind: 'pending-checkpoint',
    key,
    createdAt: 1,
    rootKind: 'media',
    rootId: id,
    rootKey,
    dueAt,
    revision: '55555555-5555-4555-8555-555555555555',
  });
}
it('reports pending checkpoint count and earliest deadline without reading capture or root values', async () => {
  const f = await setup(0);
  for (let i = 0; i < 300; i++) pendingCheckpoint(f, `waiting-${i}`, 60000 + i);
  pendingCheckpoint(f, 'immediate', 1);
  pendingCheckpoint(f, 'foreign', 0, { ...scope, profileCreatedAt: 2 });
  const before = structuredClone(f.rows);
  const page = await loadSyncQueuePage(scope, { filter: 'all' });
  expect(page).toMatchObject({
    operations: [],
    pending: { count: 301, minimumDueAt: 1 },
    problemCount: 0,
  });
  expect(f.captureGet.mock.calls.map(([key]) => key)).toEqual(['profile']);
  expect(f.getAll).toHaveBeenCalledOnce();
  expect(io.readFile).not.toHaveBeenCalled();
  expect(f.rows).toEqual(before);
});
it('keeps pending summary global when operation pages and filters change', async () => {
  const f = await setup(3);
  for (const i of [0, 1, 2]) setStatus(f, i, { status: 'failed', failureCode: 'authentication' });
  pendingCheckpoint(f, 'waiting', 60000);
  const first = await loadSyncQueuePage(scope, { filter: 'problems', limit: 1 });
  const second = await loadSyncQueuePage(scope, {
    filter: 'problems',
    limit: 1,
    cursor: first.nextCursor,
  });
  const actions = await loadSyncQueuePage(scope, { filter: 'action-required', limit: 1 });
  expect([first.pending, second.pending, actions.pending]).toEqual(
    Array(3).fill({ count: 1, minimumDueAt: 60000 })
  );
  expect((await loadSyncQueuePage(scope)).pending).toBeNull();
});
it('rejects malformed pending index coverage instead of reporting no waiting work', async () => {
  const f = await setup(0);
  pendingCheckpoint(f, 'waiting', null);
  await expect(loadSyncQueuePage(scope, { filter: 'all' })).rejects.toThrow();
  pendingCheckpoint(f, 'waiting', '60000');
  await expect(loadSyncQueuePage(scope, { filter: 'problems' })).rejects.toThrow();
  pendingCheckpoint(f, 'waiting', 60000);
  f.pendingIndex.keyPath = ['wrong'];
  await expect(loadSyncQueuePage(scope, { filter: 'all' })).rejects.toThrow();
  expect(f.captureGet.mock.calls.map(([key]) => key)).toEqual(['profile', 'profile', 'profile']);
});
it('projects retry eligibility from the same current connection snapshot without rebinding historical operations', async () => {
  const f = await setup(3);
  const original = setConnection(f);
  setStatus(f, 0, {
    status: 'failed',
    failureCode: 'authentication',
    authorization: original.identity,
  });
  setStatus(f, 1, {
    status: 'interrupted',
    failureCode: 'interrupted',
    automaticRetryCount: 5,
    authorization: null,
  });
  setStatus(f, 2, { status: 'published', outcome: 'verified', authorization: original.identity });
  const sameRevision = { ...original, identity: { ...original.identity, revision: 2 } };
  f.table('sync_connection').set('connection', sameRevision);
  const compatible = await loadSyncQueuePage(scope, { filter: 'problems' });
  expect(
    compatible.sources.map((source) => ({
      allowed: source.retryAllowed,
      reason: source.retryBlocked,
    }))
  ).toEqual([
    { allowed: true, reason: null },
    { allowed: true, reason: null },
  ]);
  setConnection(f, '44444444-4444-4444-8444-444444444444');
  const before = structuredClone(f.rows);
  const replaced = await loadSyncQueuePage(scope, { filter: 'problems' });
  expect(
    replaced.sources.map((source) => ({
      allowed: source.retryAllowed,
      reason: source.retryBlocked,
    }))
  ).toEqual([
    { allowed: false, reason: 'connection-replaced' },
    { allowed: true, reason: null },
  ]);
  expect(replaced.operations[0]?.authorization).toEqual(original.identity);
  const all = await loadSyncQueuePage(scope, { filter: 'all' });
  expect(all.sources[2]).toMatchObject({ retryAllowed: false, retryBlocked: null });
  expect(f.rows).toEqual(before);
});
