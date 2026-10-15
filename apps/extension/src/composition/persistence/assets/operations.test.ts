import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runWithDurableAssetLifecycleLock } from '../infrastructure/mutation-barrier';

const mocks = vi.hoisted(() => ({
  deleteObject: vi.fn(),
  initDB: vi.fn(),
  runMutation: vi.fn(),
  journals: vi.fn(),
  writing: vi.fn(),
  log: vi.fn(),
}));

vi.mock('../library-lifecycle/maintenance-log', () => ({
  createMaintenanceLog: () => ({ append: mocks.log }),
}));
vi.mock('../infrastructure/indexed-db/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: mocks.initDB,
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.runMutation,
}));
vi.mock('./opfs-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./opfs-store')>()),
  deleteAssetObject: mocks.deleteObject,
  listReadyJournals: mocks.journals,
  listWritingAssetIds: mocks.writing,
}));

import {
  appendAssetOperationCompensation,
  buildPhysicalDeleteOperation,
  completePhysicalDeleteOperation,
  completePhysicalDeleteOperations,
  deleteOrphanAssetObjectBatch,
  createBackupRestoreOperation,
  readAssetOperation,
  transitionAssetOperation,
  abortArchiveRestoreSession,
  appendCommittedArchiveRootInTransaction,
  beginArchiveRestoreRoot,
  completeArchiveRestoreSession,
  createArchiveRestoreSession,
  listArchiveRestoreSessions,
  readArchiveRestoreSession,
} from './operations';

const operation = {
  compensations: [],
  createdAt: 1,
  kind: 'backup-restore' as const,
  obsoleteAssetIds: [],
  operationId: 'restore-1',
  status: 'pending' as const,
  updatedAt: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
  mocks.deleteObject.mockResolvedValue(undefined);
  mocks.journals.mockResolvedValue([]);
  mocks.writing.mockResolvedValue([]);
});

function installMutationHarness(current: unknown = operation) {
  const put = vi.fn().mockResolvedValue(undefined);
  const store = { get: vi.fn().mockResolvedValue(current), put };
  const db = {
    get: vi.fn(async (): Promise<unknown> => undefined),
    getAll: vi.fn(async (_store: string): Promise<unknown[]> => []),
    add: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    transaction: vi.fn(() => ({ done: Promise.resolve(), objectStore: () => store })),
  };
  mocks.runMutation.mockImplementation(async (callback) => callback(db));
  return { db, put, store };
}

describe('durable asset operations', () => {
  it.each(['owner', 'ready'] as const)(
    'retains bytes adopted after their physical delete was journaled: %s',
    async (claim) => {
      const harness = installMutationHarness();
      const intent = buildPhysicalDeleteOperation(['shared']);
      if (claim === 'owner') {
        const ref = {
          assetId: 'shared',
          createdAt: 1,
          location: { kind: 'opfs', objectKey: 'objects/shared' },
          mimeType: 'image/png',
          size: 3,
          sha256: null,
        };
        harness.db.getAll.mockImplementation(async (store: string) =>
          store === 'asset_refs'
            ? [ref]
            : store === 'asset_owners'
              ? [
                  {
                    assetId: 'shared',
                    ownerKind: 'image-workspace',
                    ownerId: 'copy',
                    role: 'source',
                  },
                ]
              : []
        );
      } else
        mocks.journals.mockResolvedValue([
          {
            journalId: 'prepared-copy',
            domain: 'image-workspace',
            createdAt: 1,
            assetRefs: [{ assetId: 'shared' }],
            payload: {},
          },
        ]);
      await completePhysicalDeleteOperation(intent);
      expect(mocks.deleteObject).not.toHaveBeenCalled();
      if (claim === 'owner')
        expect(harness.db.delete).toHaveBeenCalledWith('asset_operations', intent.operationId);
      else expect(harness.db.delete).not.toHaveBeenCalled();
    }
  );
  it('deduplicates physical-delete asset ids and completes deletion before removing intent', async () => {
    const harness = installMutationHarness();
    const intent = buildPhysicalDeleteOperation(['asset-1', 'asset-1', 'asset-2']);

    expect(intent.assetIds).toEqual(['asset-1', 'asset-2']);
    await completePhysicalDeleteOperation(intent);

    expect(mocks.deleteObject.mock.calls.map(([assetId]) => assetId)).toEqual([
      'asset-1',
      'asset-2',
    ]);
    expect(harness.db.delete).toHaveBeenCalledWith('asset_operations', intent.operationId);
  });

  it('creates and parses a pending backup operation', async () => {
    const harness = installMutationHarness();
    const created = await createBackupRestoreOperation();
    expect(created.status).toBe('pending');
    expect(harness.db.add).toHaveBeenCalledWith('asset_operations', created);

    mocks.initDB.mockResolvedValue({ get: vi.fn().mockResolvedValue(created) });
    await expect(readAssetOperation(created.operationId)).resolves.toEqual(created);
    mocks.initDB.mockResolvedValue({ get: vi.fn().mockResolvedValue({ invalid: true }) });
    await expect(readAssetOperation(created.operationId)).resolves.toBeUndefined();
  });

  it('appends compensation and enforces the pending transition authority', async () => {
    const harness = installMutationHarness();
    const compensation = {
      assetId: 'asset-1',
      journalId: 'journal-1',
      nextMediaId: 'recording:recording-1',
      nextOwnerId: 'recording-1',
      previousRecords: {},
    };
    await appendAssetOperationCompensation(operation.operationId, compensation);
    expect(harness.put).toHaveBeenCalledWith(
      expect.objectContaining({ compensations: [compensation] })
    );

    await transitionAssetOperation(operation.operationId, 'pending', 'committed');
    expect(harness.put).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'committed' }));

    installMutationHarness({ ...operation, status: 'aborted' });
    await expect(
      appendAssetOperationCompensation(operation.operationId, compensation)
    ).rejects.toThrow('not pending');
    await expect(
      transitionAssetOperation(operation.operationId, 'pending', 'committed')
    ).rejects.toThrow('not pending');

    installMutationHarness(null);
    await expect(
      transitionAssetOperation(operation.operationId, 'pending', 'committed')
    ).rejects.toThrow('not pending');
  });

  it('persists immutable archive identity and checkpoints a root in the caller transaction', async () => {
    const harness = installMutationHarness();
    await expect(
      createArchiveRestoreSession({ archiveFingerprint: 'invalid', strategy: 'duplicate' })
    ).rejects.toThrow('fingerprint is invalid');
    const created = await createArchiveRestoreSession({
      archiveFingerprint: 'a'.repeat(64),
      strategy: 'duplicate',
    });
    expect(harness.db.add).toHaveBeenCalledWith('asset_operations', created);
    expect(created).toMatchObject({ currentRoot: null, status: 'pending', strategy: 'duplicate' });

    const session = { ...created, currentRoot: 'media:library-item:one' };
    const store = {
      get: vi.fn().mockResolvedValue(session),
      put: vi.fn().mockResolvedValue(undefined),
    };
    await appendCommittedArchiveRootInTransaction(store, session.operationId, {
      rootKey: 'media:library-item:one',
      targetRootId: 'media-copy',
      childIds: { 'scenario-asset:image': 'image-copy' },
    });
    expect(store.put).toHaveBeenCalledWith(
      expect.objectContaining({
        committedRoots: ['media:library-item:one'],
        childIdMap: { 'scenario-asset:image': 'image-copy' },
        conflictedRoots: [],
        currentRoot: null,
        rootIdMap: { 'media:library-item:one': 'media-copy' },
        skippedRoots: [],
        strategy: 'duplicate',
      })
    );

    store.get = vi.fn().mockResolvedValue({
      ...session,
      childIdMap: { 'scenario-asset:image': 'first-image-copy' },
      currentRoot: 'scenario-project:two',
    });
    await expect(
      appendCommittedArchiveRootInTransaction(store, session.operationId, {
        rootKey: 'scenario-project:two',
        targetRootId: 'scenario-copy',
        childIds: { 'scenario-asset:image': 'second-image-copy' },
      })
    ).rejects.toThrow('already mapped');

    store.get = vi.fn().mockResolvedValue(session);
    await appendCommittedArchiveRootInTransaction(store, session.operationId, {
      rootKey: 'media:library-item:one',
      targetRootId: 'media-existing',
      imported: false,
      conflicted: true,
    });
    expect(store.put).toHaveBeenLastCalledWith(
      expect.objectContaining({
        conflictedRoots: ['media:library-item:one'],
        skippedRoots: ['media:library-item:one'],
      })
    );
  });

  it('enforces archive root and terminal session transitions', async () => {
    const session = {
      archiveFingerprint: 'b'.repeat(64),
      childIdMap: {},
      committedRoots: [],
      conflictedRoots: [],
      createdAt: 1,
      currentRoot: null,
      kind: 'archive-restore-session' as const,
      operationId: 'restore-v6',
      rootIdMap: {},
      skippedRoots: [],
      status: 'pending' as const,
      strategy: 'replace' as const,
      updatedAt: 1,
    };
    const harness = installMutationHarness(session);
    await expect(
      beginArchiveRestoreRoot(session.operationId, 'video-project:one')
    ).resolves.toMatchObject({
      currentRoot: 'video-project:one',
    });
    expect(harness.put).toHaveBeenCalled();

    installMutationHarness(session);
    await expect(completeArchiveRestoreSession(session.operationId)).resolves.toMatchObject({
      status: 'completed',
    });
    installMutationHarness(session);
    await expect(abortArchiveRestoreSession(session.operationId)).resolves.toMatchObject({
      status: 'aborted',
    });

    mocks.initDB.mockResolvedValue({
      get: vi.fn().mockResolvedValue(session),
      getAll: vi.fn().mockResolvedValue([session, operation, { malformed: true }]),
    });
    await expect(readArchiveRestoreSession(session.operationId)).resolves.toEqual(session);
    await expect(listArchiveRestoreSessions()).resolves.toEqual([session]);
  });
});

it.each(['obsolete', 'receipt'] as const)(
  'retains bytes needed by unresolved legacy rollback: %s',
  async (claim) => {
    const harness = installMutationHarness();
    const backup = {
      ...operation,
      obsoleteAssetIds: claim === 'obsolete' ? ['rollback-byte'] : [],
      compensations:
        claim === 'receipt'
          ? [
              {
                assetId: 'new-byte',
                journalId: 'legacy-ready',
                nextMediaId: 'legacy',
                nextOwnerId: 'legacy',
                previousRecords: { assetRefEntry: { assetId: 'rollback-byte' } },
              },
            ]
          : [],
    };
    harness.db.getAll.mockImplementation(async (store) =>
      store === 'asset_operations' ? [backup] : []
    );
    const intent = buildPhysicalDeleteOperation(['rollback-byte']);
    await completePhysicalDeleteOperation(intent);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(harness.db.delete).not.toHaveBeenCalled();
  }
);

it('defers physical deletion when durable operation authority is invalid', async () => {
  const harness = installMutationHarness();
  harness.db.getAll.mockImplementation(async (store) =>
    store === 'asset_operations'
      ? [{ kind: 'backup-restore', obsoleteAssetIds: ['rollback-byte'] }]
      : []
  );
  const intent = buildPhysicalDeleteOperation(['rollback-byte']);
  await completePhysicalDeleteOperation(intent);
  expect(mocks.deleteObject).not.toHaveBeenCalled();
  expect(harness.db.delete).not.toHaveBeenCalled();
});

it.each(['recording', 'invalid-source'] as const)(
  'retains physical intent when durable %s metadata remains without refs and owners',
  async (kind) => {
    const harness = installMutationHarness();
    const intent = buildPhysicalDeleteOperation(['shared']);
    harness.db.getAll.mockImplementation(async (store: string) =>
      store === 'recordings'
        ? [
            kind === 'recording'
              ? {
                  id: 'survivor',
                  assetId: 'shared',
                  createdAt: 1,
                  filename: 'r.webm',
                  mimeType: 'video/webm',
                  size: 3,
                }
              : { id: 'invalid', invalid: true },
          ]
        : []
    );
    await completePhysicalDeleteOperation(intent);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(harness.db.delete).not.toHaveBeenCalled();
  }
);

it('reads retention once for an entire physical-delete operation', async () => {
  const { db } = installMutationHarness();
  await completePhysicalDeleteOperation(
    buildPhysicalDeleteOperation(Array.from({ length: 32 }, (_, i) => `asset-${i}`))
  );
  expect(db.getAll).toHaveBeenCalledTimes(12);
  expect(mocks.deleteObject).toHaveBeenCalledTimes(32);
});

it('retains the failing and unprocessed intents after a partial replay batch', async () => {
  const { db } = installMutationHarness();
  const intents = ['a', 'b', 'c'].map((id) => ({
    ...buildPhysicalDeleteOperation([id]),
    operationId: `delete-${id}`,
  }));
  mocks.deleteObject.mockImplementation(async (id: string) => {
    if (id === 'b') throw new Error('storage failure');
  });
  await expect(completePhysicalDeleteOperations(intents)).rejects.toThrow('storage failure');
  expect(mocks.log).toHaveBeenCalledWith(
    expect.objectContaining({ code: 'delete-failed', counts: { deleted: 0, failed: 1 } })
  );
  expect(mocks.log).toHaveBeenCalledWith(
    expect.objectContaining({ code: 'deleted', counts: { deleted: 1 } })
  );
  expect(db.getAll).toHaveBeenCalledTimes(12);
  expect(db.delete.mock.calls).toEqual([['asset_operations', 'delete-a']]);
  expect(mocks.deleteObject.mock.calls).toEqual([['a'], ['b']]);
});

it('does not scan for an empty replay batch', async () => {
  const { db } = installMutationHarness();
  await completePhysicalDeleteOperations([]);
  expect(db.getAll).not.toHaveBeenCalled();
  expect(db.delete).not.toHaveBeenCalled();
});

it('keeps busy logical-only retirement without scanning Library during an editor save', async () => {
  const { db } = installMutationHarness();
  const request = vi.fn(
    async (name: string, _options: unknown, action: (lock: unknown) => Promise<unknown>) =>
      action(name === 'sniptale:assets:resource-readers' ? null : {})
  );
  vi.stubGlobal('navigator', { locks: { request } });
  try {
    await completePhysicalDeleteOperation({
      ...buildPhysicalDeleteOperation([]),
      privateSources: [{ projectAssetId: 'held', expectedAssetId: 'bytes' }],
    });
    expect(db.getAll).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

it('retains physical-delete intent without scanning while an editor is open, then retries', async () => {
  const { db } = installMutationHarness();
  let readerOpen = true;
  const request = vi.fn(
    async (name: string, _options: unknown, action: (lock: unknown) => Promise<unknown>) =>
      action(name === 'sniptale:assets:resource-readers' && readerOpen ? null : {})
  );
  vi.stubGlobal('navigator', { locks: { request } });
  const intent = buildPhysicalDeleteOperation(['obsolete']);
  try {
    await completePhysicalDeleteOperation(intent);
    expect(db.getAll).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    readerOpen = false;
    await completePhysicalDeleteOperation(intent);
    expect(mocks.deleteObject).toHaveBeenCalledExactlyOnceWith('obsolete');
    expect(db.delete).toHaveBeenCalledWith('asset_operations', intent.operationId);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('keeps projected targets pending while completing unrelated intents in the same batch', async () => {
  const { db } = installMutationHarness();
  db.getAll.mockImplementation(async (store: string) =>
    store === 'recordings'
      ? [
          {
            id: 'retained',
            assetId: 'protected',
            createdAt: 1,
            filename: 'r.webm',
            mimeType: 'video/webm',
            size: 1,
          },
        ]
      : []
  );
  await completePhysicalDeleteOperations(
    ['protected', 'unowned'].map((id) => ({
      ...buildPhysicalDeleteOperation([id]),
      operationId: `delete-${id}`,
    }))
  );
  expect(db.getAll).toHaveBeenCalledTimes(12);
  expect(mocks.deleteObject.mock.calls).toEqual([['unowned']]);
  expect(db.delete.mock.calls).toEqual([['asset_operations', 'delete-unowned']]);
  expect(mocks.log).toHaveBeenCalledWith(
    expect.objectContaining({ code: 'referenced', counts: { retained: 1 } })
  );
});

it.each(['complete', 'writing', 'cancel-before', 'cancel-after-intent'] as const)(
  'keeps orphan batch intent and physical effects ordered: %s',
  async (mode) => {
    const { db } = installMutationHarness();
    const controller = new AbortController();
    const put = vi.fn(async () => {
      if (mode === 'cancel-after-intent') controller.abort();
    });
    mocks.runMutation.mockImplementation(async (callback) => callback({ ...db, put }));
    if (mode === 'writing') mocks.writing.mockResolvedValue(['orphan']);
    if (mode === 'cancel-before') controller.abort();
    await runWithDurableAssetLifecycleLock((permit) =>
      deleteOrphanAssetObjectBatch(['orphan'], controller.signal, permit)
    );
    expect(put).toHaveBeenCalledTimes(
      mode === 'complete' || mode === 'cancel-after-intent' ? 1 : 0
    );
    expect(mocks.deleteObject).toHaveBeenCalledTimes(mode === 'complete' ? 1 : 0);
    expect(db.delete).toHaveBeenCalledTimes(mode === 'complete' ? 1 : 0);
  }
);
