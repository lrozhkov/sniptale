import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import type { IndexedDbWriteTransaction } from '../infrastructure/indexed-db/core';
import {
  runWithPersistenceMutationPermit,
  type PersistenceMutationPermit,
} from '../infrastructure/mutation-barrier';
import {
  assetResidencyCopyId,
  parseAssetResidencyRecord,
  DEFAULT_ASSET_RESIDENCY_BUDGET_BYTES,
  type AssetResidencyCopy,
  type AssetResidencyTarget,
} from './residency-records';
import {
  beginAssetResidencyUnloadInTransaction,
  admitRemoteAssetResidencyInTransaction,
  retireAssetResidencyCopyInTransaction,
  finishAssetResidencyTransitionInTransaction,
  readAssetResidencyCopyInTransaction,
  readAssetResidencyCopiesPageInTransaction,
  readAssetResidencyRootsPageInTransaction,
  readAssetResidencyRootInTransaction,
  readAssetResidencySettingsInTransaction,
  setAssetResidencyBudgetInTransaction,
  setAssetResidencyRootPinnedInTransaction,
  touchAssetResidencyRootInTransaction,
  type AssetResidencyUnloadDraft,
} from './residency';

beforeEach(() => {
  vi.stubGlobal('IDBKeyRange', {
    bound: (lower: string, upper: string, lowerOpen = false, upperOpen = false) => ({
      lower,
      upper,
      lowerOpen,
      upperOpen,
    }),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

type Transaction = Pick<IndexedDbWriteTransaction, 'objectStore'>;
function fixture() {
  let fail = false;
  const f = createReviewWorkspaceStoreFixture((name) => fail && name === 'asset_residency');
  f.rows.set('asset_residency', new Map());
  const transact = <T>(
    operation: (tx: Transaction, permit: PersistenceMutationPermit) => Promise<T>
  ) =>
    runWithPersistenceMutationPermit(async (permit) => {
      const tx = f.database.transaction(['asset_residency'], 'readwrite');
      // Native browser boundary fixture implements only the transaction methods used by the owner.
      const native = tx as unknown as Transaction;
      try {
        const result = await operation(native, permit);
        await tx.done;
        return result;
      } catch (error) {
        tx.abort();
        await tx.done.catch(() => undefined);
        throw error;
      }
    });
  return {
    ...f,
    transact,
    failWrites: () => {
      fail = true;
    },
    allowWrites: () => {
      fail = false;
    },
  };
}
function draft(assetId = 'asset-1'): AssetResidencyUnloadDraft {
  return {
    operationId: `unload-${assetId}`,
    lastUsedAt: 10,
    target: {
      kind: 'opfs',
      ref: {
        assetId,
        createdAt: 1,
        location: { kind: 'opfs', objectKey: `objects/${assetId}` },
        mimeType: 'image/png',
        size: 100,
        sha256: null,
      },
    },
    remote: {
      key: `objects/${assetId}/original.png`,
      sha256: 'a'.repeat(64),
      binding: {
        provider: 'webdav',
        rootUrl: 'https://dav.example.test/root/',
        accountId: 'account',
        spaceId: 'space',
        connectionGeneration: 1,
        profileCreatedAt: 1,
      },
    },
  };
}
function begin(f: ReturnType<typeof fixture>, value = draft(), expected: number | null = null) {
  return f.transact((tx, permit) =>
    beginAssetResidencyUnloadInTransaction(tx, value, expected, permit)
  );
}
function finish(
  f: ReturnType<typeof fixture>,
  copy: AssetResidencyCopy,
  phase: 'unloaded' | 'resident'
) {
  return f.transact((tx, permit) =>
    finishAssetResidencyTransitionInTransaction(tx, copy, phase, permit)
  );
}

it('retains the exact recovery binding across transaction restart and completes its phase sequence', async () => {
  const f = fixture();
  const intent = await begin(f);
  const reread = await f.transact((tx) => readAssetResidencyCopyInTransaction(tx, intent.id));
  expect(reread).toEqual(intent);
  const unloaded = await finish(f, intent, 'unloaded');
  expect(unloaded).toMatchObject({ phase: 'unloaded', revision: 2 });
  const resident = await finish(f, unloaded, 'resident');
  expect(resident).toMatchObject({ phase: 'resident', revision: 3 });
  expect(resident.target).toEqual(draft().target);
  expect(resident.remote).toEqual(draft().remote);
});

it('replays the same unload and exact committed completion without a new revision', async () => {
  const f = fixture();
  const first = await begin(f);
  expect(await begin(f)).toEqual(first);
  const unloaded = await finish(f, first, 'unloaded');
  expect(await finish(f, first, 'unloaded')).toEqual(unloaded);
  expect(await begin(f)).toEqual(unloaded);
  const resident = await finish(f, unloaded, 'resident');
  expect(await finish(f, unloaded, 'resident')).toEqual(resident);
  await expect(begin(f, draft(), resident.revision)).rejects.toThrow('cannot restart');
});

it('refuses a competing unload and preserves the pending command', async () => {
  const f = fixture();
  const first = await begin(f);
  await expect(begin(f, { ...draft(), operationId: 'competing' }, first.revision)).rejects.toThrow(
    'revision is stale'
  );
  expect(await f.transact((tx) => readAssetResidencyCopyInTransaction(tx, first.id))).toEqual(
    first
  );
});

it('refuses a delayed parallel intent computed before the first writer commits', async () => {
  const f = fixture();
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const delayed = wait.then(() => begin(f, { ...draft(), operationId: 'delayed' }, null));
  const first = await begin(f);
  release();
  await expect(delayed).rejects.toThrow('revision is stale');
  expect(await f.transact((tx) => readAssetResidencyCopyInTransaction(tx, first.id))).toEqual(
    first
  );
});

it.each(['source', 'remote', 'operation'] as const)(
  'refuses a foreign completion %s',
  async (change) => {
    const f = fixture();
    const current = await begin(f);
    const other = structuredClone(current);
    if (change === 'source' && other.target.kind === 'opfs') other.target.ref.createdAt++;
    if (change === 'remote') other.remote.key = 'objects/foreign/original.png';
    if (change === 'operation') other.operationId = 'foreign';
    await expect(finish(f, other, 'unloaded')).rejects.toThrow('source is stale');
    expect(await f.transact((tx) => readAssetResidencyCopyInTransaction(tx, current.id))).toEqual(
      current
    );
  }
);

it('refuses delayed unload completion after restore and a new same-ID operation', async () => {
  const f = fixture();
  const old = await begin(f);
  const unloaded = await finish(f, old, 'unloaded');
  const resident = await finish(f, unloaded, 'resident');
  await expect(finish(f, old, 'unloaded')).rejects.toThrow('revision is stale');
  const next = await begin(f, { ...draft(), operationId: 'new-operation' }, resident.revision);
  await expect(finish(f, unloaded, 'resident')).rejects.toThrow('source is stale');
  expect(await f.transact((tx) => readAssetResidencyCopyInTransaction(tx, next.id))).toEqual(next);
});

it('refuses stale completion after deletion and native same-key recreation', async () => {
  const f = fixture();
  const old = await begin(f);
  f.rows.get('asset_residency')!.delete(old.id);
  const recreated = await begin(f, { ...draft(), operationId: 'new-incarnation' });
  await expect(finish(f, old, 'unloaded')).rejects.toThrow('source is stale');
  expect(await f.transact((tx) => readAssetResidencyCopyInTransaction(tx, recreated.id))).toEqual(
    recreated
  );
});

it('requires the latest resident revision and a new command before replacing a same-key descriptor', async () => {
  const f = fixture();
  const first = await begin(f);
  const resident = await finish(f, await finish(f, first, 'unloaded'), 'resident');
  const changed = draft();
  if (changed.target.kind === 'opfs') changed.target.ref.createdAt = 20;
  changed.operationId = 'new-source';
  await expect(begin(f, changed, 1)).rejects.toThrow('revision is stale');
  const next = await begin(f, changed, resident.revision);
  expect(next.target).toEqual(changed.target);
  expect(next.revision).toBe(4);
});

it('aborts quota failure without changing the committed phase and supports exact retry', async () => {
  const f = fixture();
  const first = await begin(f);
  f.failWrites();
  await expect(finish(f, first, 'unloaded')).rejects.toMatchObject({ name: 'QuotaExceededError' });
  expect(await f.transact((tx) => readAssetResidencyCopyInTransaction(tx, first.id))).toEqual(
    first
  );
  f.allowWrites();
  await expect(finish(f, first, 'unloaded')).resolves.toMatchObject({
    phase: 'unloaded',
    revision: 2,
  });
});

it('keeps related intent and Settings writes atomic when the caller aborts', async () => {
  const f = fixture();
  await expect(
    f.transact(async (tx, permit) => {
      await beginAssetResidencyUnloadInTransaction(tx, draft(), null, permit);
      await setAssetResidencyBudgetInTransaction(tx, 0, 0, permit);
      throw new Error('caller refused');
    })
  ).rejects.toThrow('caller refused');
  expect(f.rows.get('asset_residency')!.size).toBe(0);
});

it('preserves committed rows when retained authority is malformed instead of repairing it', async () => {
  const f = fixture();
  const first = await begin(f);
  f.rows.get('asset_residency')!.set(first.id, { ...first, unexpected: 'credential' });
  const before = structuredClone(f.rows.get('asset_residency'));
  await expect(begin(f)).rejects.toThrow('record is invalid');
  await expect(
    f.transact((tx) => readAssetResidencyCopyInTransaction(tx, first.id))
  ).rejects.toThrow('record is invalid');
  expect(f.rows.get('asset_residency')).toEqual(before);
});

it('retains inline identity and duplicate preview descriptors without storing byte payloads', async () => {
  const f = fixture();
  const target: AssetResidencyTarget = {
    kind: 'inline-image',
    mediaId: 'image-1',
    createdAt: 1,
    workspaceRevision: 4,
    rootGeneration: 2,
    nativeDigest: 'b'.repeat(64),
    size: 100,
    mimeType: 'image/png',
    blobType: '',
    duplicatePreview: { presentationRevision: 4, blobType: 'image/png' },
  };
  const copy = await begin(f, { ...draft(), target });
  expect(copy.target).toEqual(target);
  expect(await f.transact((tx) => readAssetResidencyCopyInTransaction(tx, copy.id))).toEqual(copy);
});

it.each(['extra', 'traversal', 'secret', 'digest'] as const)(
  'refuses invalid metadata command before writing: %s',
  async (change) => {
    const f = fixture();
    const value = draft();
    if (change === 'extra') Reflect.set(value.target, 'body', new Blob(['private']));
    if (change === 'traversal') value.remote.key = '../private';
    if (change === 'secret') Reflect.set(value.remote.binding, 'password', 'private');
    if (change === 'digest') value.remote.sha256 = 'invalid';
    await expect(begin(f, value)).rejects.toThrow('command is invalid');
    expect(f.rows.get('asset_residency')!.size).toBe(0);
  }
);

it('returns an unwritten default budget, persists zero, and refuses stale Settings CAS', async () => {
  const f = fixture();
  expect(await f.transact((tx) => readAssetResidencySettingsInTransaction(tx))).toMatchObject({
    revision: 0,
    budgetBytes: DEFAULT_ASSET_RESIDENCY_BUDGET_BYTES,
  });
  expect(f.rows.get('asset_residency')!.size).toBe(0);
  const settings = await f.transact((tx, permit) =>
    setAssetResidencyBudgetInTransaction(tx, 0, 0, permit)
  );
  expect(settings).toMatchObject({ revision: 1, budgetBytes: 0 });
  await expect(
    f.transact((tx, permit) => setAssetResidencyBudgetInTransaction(tx, 100, 0, permit))
  ).rejects.toThrow('revision is stale');
  expect(await f.transact((tx) => readAssetResidencySettingsInTransaction(tx))).toEqual(settings);
});

it('reloads current pin intent for delayed usage touches after pin and unpin', async () => {
  const f = fixture();
  await f.transact((tx, permit) =>
    touchAssetResidencyRootInTransaction(tx, 'media', 'root', 10, permit)
  );
  await f.transact((tx, permit) =>
    setAssetResidencyRootPinnedInTransaction(tx, 'media', 'root', true, 20, permit)
  );
  const touched = await f.transact((tx, permit) =>
    touchAssetResidencyRootInTransaction(tx, 'media', 'root', 15, permit)
  );
  expect(touched).toMatchObject({ pinned: true, lastUsedAt: 20 });
  await f.transact((tx, permit) =>
    setAssetResidencyRootPinnedInTransaction(tx, 'media', 'root', false, 25, permit)
  );
  await f.transact((tx, permit) =>
    touchAssetResidencyRootInTransaction(tx, 'media', 'root', 19, permit)
  );
  expect(
    await f.transact((tx) => readAssetResidencyRootInTransaction(tx, 'media', 'root'))
  ).toMatchObject({ pinned: false, lastUsedAt: 25 });
});

it('reads at most 64 primary keys per prefix page without losing continuation', async () => {
  const f = fixture();
  await f.transact(async (tx, permit) => {
    for (let i = 0; i < 65; i++)
      await beginAssetResidencyUnloadInTransaction(tx, draft(`asset-${i}`), null, permit);
    await touchAssetResidencyRootInTransaction(tx, 'media', 'root', 1, permit);
    await setAssetResidencyBudgetInTransaction(tx, 0, 0, permit);
  });
  const first = await f.transact((tx) => readAssetResidencyCopiesPageInTransaction(tx));
  const second = await f.transact((tx) =>
    readAssetResidencyCopiesPageInTransaction(tx, first.nextId!)
  );
  expect(first.records).toHaveLength(64);
  expect(second.records).toHaveLength(1);
  expect(second.nextId).toBeNull();
  expect(new Set([...first.records, ...second.records].map((record) => record.id)).size).toBe(65);
  expect(
    (await f.transact((tx) => readAssetResidencyRootsPageInTransaction(tx))).records
  ).toHaveLength(1);
});

it('refuses a permit retained after its mutation lifetime ends', async () => {
  const f = fixture();
  let retained!: PersistenceMutationPermit;
  await runWithPersistenceMutationPermit(async (permit) => {
    retained = permit;
  });
  await expect(
    f.transact((tx) => beginAssetResidencyUnloadInTransaction(tx, draft(), null, retained))
  ).rejects.toThrow('permit is not active');
  expect(f.rows.get('asset_residency')!.size).toBe(0);
});

it('refuses malformed retained inline descriptors without changing valid metadata', async () => {
  const f = fixture();
  const first = await begin(f);
  const invalid = { ...first, target: { kind: 'inline-image', mediaId: 'image-1' } };
  expect(parseAssetResidencyRecord(invalid)).toBeNull();
  expect(assetResidencyCopyId(first.target)).toBe(first.id);
  expect(await f.transact((tx) => readAssetResidencyCopyInTransaction(tx, first.id))).toEqual(
    first
  );
});

it('retains ordinary Unicode space and percent DAV names through command replay', async () => {
  const f = fixture();
  const value = draft();
  value.remote.key = 'Originals/attempt/Снимок экрана 100%.png';
  const copy = await begin(f, value);
  expect(copy.remote.key).toBe(value.remote.key);
  expect(await begin(f, value)).toEqual(copy);
  expect(await finish(f, copy, 'unloaded')).toMatchObject({ remote: value.remote });
});

it('settles an interrupted unload resident without pretending bytes were removed', async () => {
  const f = fixture();
  const intent = await begin(f);
  const resident = await finish(f, intent, 'resident');
  expect(resident).toEqual({ ...intent, revision: 2, phase: 'resident' });
  expect(await finish(f, intent, 'resident')).toEqual(resident);
  await expect(begin(f, draft(), resident.revision)).rejects.toThrow('cannot restart');
});

it('refuses delayed removal completion after pending unload is cancelled', async () => {
  const f = fixture();
  const intent = await begin(f);
  const resident = await finish(f, intent, 'resident');
  await expect(finish(f, intent, 'unloaded')).rejects.toThrow('revision is stale');
  expect(await f.transact((tx) => readAssetResidencyCopyInTransaction(tx, intent.id))).toEqual(
    resident
  );
});

it.each([
  '/original.png',
  'original.png/',
  'objects//original.png',
  'objects/./original.png',
  'objects/../original.png',
  'objects\\original.png',
  'objects/original.png?query',
  'objects/original.png#fragment',
  'https://foreign.test/original.png',
  'objects/\u0000.png',
  'objects/\u007f.png',
  'x'.repeat(2049),
])('refuses unsafe remote recovery key %j', async (key) => {
  const f = fixture();
  const value = draft();
  value.remote.key = key;
  await expect(begin(f, value)).rejects.toThrow('command is invalid');
  expect(f.rows.get('asset_residency')!.size).toBe(0);
});

it('retires exact recovery evidence with native replacement and permits an absent retry', async () => {
  const f = fixture();
  const copy = await finish(f, await begin(f), 'unloaded');
  await f.transact((tx, permit) => retireAssetResidencyCopyInTransaction(tx, copy, permit));
  expect(await f.transact((tx) => readAssetResidencyCopyInTransaction(tx, copy.id))).toBeNull();
  await f.transact((tx, permit) => retireAssetResidencyCopyInTransaction(tx, copy, permit));
});

it('refuses old retirement after a new same-ID unload operation replaced its source', async () => {
  const f = fixture();
  const old = await finish(f, await begin(f), 'unloaded');
  const resident = await finish(f, old, 'resident');
  const current = await begin(f, { ...draft(), operationId: 'new-operation' }, resident.revision);
  await expect(
    f.transact((tx, permit) => retireAssetResidencyCopyInTransaction(tx, old, permit))
  ).rejects.toThrow('source is stale');
  expect(await f.transact((tx) => readAssetResidencyCopyInTransaction(tx, current.id))).toEqual(
    current
  );
});

it('admits initially remote bytes without an unload transition and preserves exact replay', async () => {
  const f = fixture();
  const value = draft();
  const admit = (candidate = value) =>
    f.transact((tx, permit) => admitRemoteAssetResidencyInTransaction(tx, candidate, permit));
  const first = await admit();
  expect(first).toMatchObject({ phase: 'unloaded', revision: 1 });
  expect(await admit()).toEqual(first);
  await expect(admit({ ...value, operationId: 'foreign' })).rejects.toThrow('already claimed');
  expect(await f.transact((tx) => readAssetResidencyCopyInTransaction(tx, first.id))).toEqual(
    first
  );
});
