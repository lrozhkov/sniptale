import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import { captureRootKey, type CapturedChange } from './contracts';
import {
  enqueueSyncQueueOperation,
  loadSyncQueue,
  loadSyncQueueOperation,
  loadSyncQueuePage,
} from './queue';
import { queueOperationKey, type SyncQueueScope } from './queue-model';

const io = vi.hoisted(() => ({ database: vi.fn() }));
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

async function setup(count: number) {
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
  const database = {
    transaction(stores: string[], mode: string) {
      const tx = fixture.database.transaction(stores, mode);
      return {
        abort: tx.abort,
        objectStore(name: string) {
          const store = tx.objectStore(name);
          return name === 'sync_outbox' ? { ...store, getAll } : store;
        },
        get done() {
          return tx.done;
        },
      };
    },
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
  for (const id of ids) {
    const capture: CapturedChange = {
      version: 1,
      kind: 'captured-change',
      key: JSON.stringify(['change', id]),
      createdAt: 1,
      spaceId: 'space',
      connectionGeneration: 3,
      rootKind: 'media',
      rootId: 'root',
      rootKey: captureRootKey('space', 'media', 'root'),
      generation: 1,
      operationId: id,
      basis: [],
      origin: 'local-edit',
      publicationId: null,
      change: { kind: 'tombstone' },
    };
    table('sync_capture').set(capture.key, capture);
    await enqueueSyncQueueOperation(capture);
  }
  getAll.mockClear();
  return { table, ids, database, getAll, rows: fixture.rows };
}
it('traverses a queue beyond the pilot bound with bounded exclusive pages and no writes', async () => {
  const f = await setup(137);
  const before = structuredClone(f.rows);
  const seen: string[] = [];
  let page = await loadSyncQueuePage(scope, { limit: 17 });
  for (;;) {
    seen.push(...page.operations.map((row) => row.operationId));
    expect(page.operations.length).toBeLessThanOrEqual(17);
    if (!page.nextCursor) break;
    page = await loadSyncQueuePage(scope, { limit: 17, cursor: page.nextCursor });
  }
  expect(seen).toEqual(f.ids);
  expect(new Set(seen).size).toBe(137);
  expect(f.getAll.mock.calls.every(([, limit]) => limit === 18)).toBe(true);
  expect(f.rows).toEqual(before);
  await expect(loadSyncQueue(scope)).rejects.toThrow('limit');
});
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
  expect(await loadSyncQueuePage(scope)).toMatchObject({ operations: [], nextCursor: null });
  await setup(2);
  expect(await loadSyncQueuePage(scope, { limit: 2 })).toMatchObject({ nextCursor: null });
});
