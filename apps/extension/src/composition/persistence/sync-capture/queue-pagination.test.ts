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
    bound: (lower: string, upper: string, lowerOpen = false): Range => ({
      lower,
      upper,
      lowerOpen,
    }),
  });
});
afterEach(() => vi.unstubAllGlobals());

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
              get(key: IDBValidKey) {
                captureGet(key);
                return store.get(key);
              },
            };
          return name === 'sync_outbox' ? { ...store, getAll } : store;
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
  return { table, ids, database, getAll, captureGet, rows: fixture.rows };
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
