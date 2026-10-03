import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AssetReadyJournal, PhysicalDeleteAssetOperation } from '../assets/contracts';
import type { PersistenceLockManager } from '../infrastructure/mutation-barrier';

// Replace only storage adapters. Retention parsing, mutation permits, lifecycle/object locks,
// durable intent creation and physical-delete completion are the production participants.
const storage = vi.hoisted(() => ({
  reads: 0,
  rows: new Map<string, unknown[]>(),
  intents: new Map<string, PhysicalDeleteAssetOperation>(),
  objects: new Set<string>(),
  writing: new Set<string>(),
  journals: [] as AssetReadyJournal[],
  deleteObject: vi.fn(),
  beforeObjectList: vi.fn(),
}));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: async () => ({
    getAll: async (store: string) => {
      storage.reads += 1;
      return store === 'asset_operations'
        ? [...storage.intents.values(), ...(storage.rows.get(store) ?? [])]
        : (storage.rows.get(store) ?? []);
    },
    put: async (store: string, operation: PhysicalDeleteAssetOperation) => {
      if (store !== 'asset_operations') throw new Error('Unexpected test write');
      storage.intents.set(operation.operationId, operation);
    },
    delete: async (store: string, id: string) => {
      if (store !== 'asset_operations') throw new Error('Unexpected test deletion');
      storage.intents.delete(id);
    },
  }),
}));
vi.mock('../assets/opfs-store', async (original) => ({
  ...(await original<typeof import('../assets/opfs-store')>()),
  listAssetObjectIds: async () => {
    await storage.beforeObjectList();
    return [...storage.objects];
  },
  listWritingAssetIds: async () => [...storage.writing],
  listReadyJournals: async () => storage.journals,
  deleteAssetObject: storage.deleteObject,
}));
import { collectOrphanAssetObjectsDuringIdle } from './audit';
import { completePhysicalDeleteOperation } from '../assets/operations';
import { runWithDurableAssetLifecycleLock } from '../infrastructure/mutation-barrier';

function coordinatedLocks(): PersistenceLockManager {
  const tails = new Map<string, Promise<unknown>>();
  return {
    request<T>(
      name: string,
      options: { mode: 'exclusive' | 'shared'; ifAvailable?: boolean },
      operation: (lock?: unknown) => T | Promise<T>
    ): Promise<T> {
      if (options.ifAvailable && tails.has(name)) return Promise.resolve(operation(null));
      const previous = tails.get(name) ?? Promise.resolve();
      const next = previous.then(() => operation({ name }));
      const settled = next.then(
        () => undefined,
        () => undefined
      );
      tails.set(name, settled);
      void settled.then(() => {
        if (tails.get(name) === settled) tails.delete(name);
      });
      return next;
    },
  };
}
let locks: PersistenceLockManager;
beforeEach(() => {
  storage.reads = 0;
  storage.rows.clear();
  storage.intents.clear();
  storage.objects.clear();
  storage.writing.clear();
  storage.journals = [];
  vi.resetAllMocks();
  storage.deleteObject.mockImplementation(async (id: string) => {
    storage.objects.delete(id);
  });
  locks = coordinatedLocks();
  vi.stubGlobal('navigator', { locks });
});
afterEach(() => vi.unstubAllGlobals());
function ref(assetId: string) {
  return {
    assetId,
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: `objects/${assetId}` },
    mimeType: 'video/webm',
    sha256: null,
    size: 3,
  };
}
function recording(assetId: string) {
  return {
    assetId,
    createdAt: 1,
    filename: 'test.webm',
    id: 'recording-1',
    mimeType: 'video/webm',
    size: 3,
  };
}
it('retains shared, projected, ready, writing and rollback bytes through the real projection', async () => {
  for (const id of ['shared', 'projected', 'ready', 'writing', 'rollback', 'orphan'])
    storage.objects.add(id);
  storage.rows.set('asset_refs', [ref('shared')]);
  storage.rows.set('asset_owners', [
    { assetId: 'shared', ownerId: 'one', ownerKind: 'recording', role: 'body' },
    { assetId: 'shared', ownerId: 'two', ownerKind: 'recording', role: 'body' },
  ]);
  storage.rows.set('recordings', [recording('projected')]);
  storage.rows.set('asset_operations', [
    {
      operationId: 'rollback-intent',
      kind: 'backup-restore',
      status: 'pending',
      createdAt: 1,
      updatedAt: 1,
      compensations: [],
      obsoleteAssetIds: ['rollback'],
    },
  ]);
  storage.writing.add('writing');
  storage.journals = [
    {
      journalId: 'ready-journal',
      createdAt: 1,
      domain: 'image-workspace',
      assetRefs: [],
      payload: { refs: [ref('ready')] },
    },
  ];
  await collectOrphanAssetObjectsDuringIdle(new AbortController().signal);
  expect([...storage.objects].sort()).toEqual([
    'projected',
    'ready',
    'rollback',
    'shared',
    'writing',
  ]);
  expect(storage.deleteObject).toHaveBeenCalledExactlyOnceWith('orphan');
  expect(storage.intents.size).toBe(0);
});
it('retains a newly adopted candidate after discovery and skips a live writer lock', async () => {
  storage.objects.add('adopted');
  storage.objects.add('writer');
  storage.beforeObjectList.mockImplementationOnce(async () => {
    await vi.waitFor(() => expect(storage.reads).toBeGreaterThanOrEqual(12));
    await runWithDurableAssetLifecycleLock(async () => {
      storage.rows.set('recordings', [recording('adopted')]);
    });
  });
  let release!: () => void;
  let acquired!: () => void;
  const entered = new Promise<void>((resolve) => {
    acquired = resolve;
  });
  const writer = locks.request('sniptale-asset:writer', { mode: 'exclusive' }, async () => {
    acquired();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  await entered;
  await collectOrphanAssetObjectsDuringIdle(new AbortController().signal);
  expect(storage.deleteObject).not.toHaveBeenCalled();
  expect(storage.objects.size).toBe(2);
  release();
  await writer;
});
it('leaves committed intent on IO failure and replays it through the physical owner', async () => {
  storage.objects.add('orphan');
  storage.deleteObject.mockRejectedValueOnce(new Error('IO unavailable'));
  await expect(collectOrphanAssetObjectsDuringIdle(new AbortController().signal)).rejects.toThrow(
    'IO unavailable'
  );
  expect(storage.objects.has('orphan')).toBe(true);
  expect(storage.intents.size).toBe(1);
  for (const intent of storage.intents.values()) await completePhysicalDeleteOperation(intent);
  await collectOrphanAssetObjectsDuringIdle(new AbortController().signal);
  expect(storage.objects.size).toBe(0);
  expect(storage.intents.size).toBe(0);
});
it('two Gallery passes delete idempotently and yield to a foreground lifecycle holder', async () => {
  storage.objects.add('orphan');
  await runWithDurableAssetLifecycleLock(async () => {
    await collectOrphanAssetObjectsDuringIdle(new AbortController().signal);
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
  await Promise.all([
    collectOrphanAssetObjectsDuringIdle(new AbortController().signal),
    collectOrphanAssetObjectsDuringIdle(new AbortController().signal),
  ]);
  expect(storage.deleteObject).toHaveBeenCalledWith('orphan');
  expect(storage.objects.size).toBe(0);
  expect(storage.intents.size).toBe(0);
});
it('aborts before any deletion and fails closed on malformed authoritative rows', async () => {
  storage.objects.add('orphan');
  const abort = new AbortController();
  storage.beforeObjectList.mockImplementationOnce(async () => abort.abort());
  await collectOrphanAssetObjectsDuringIdle(abort.signal);
  storage.rows.set('recordings', [{ invalid: true }]);
  await collectOrphanAssetObjectsDuringIdle(new AbortController().signal);
  expect(storage.deleteObject).not.toHaveBeenCalled();
  expect(storage.intents.size).toBe(0);
});
