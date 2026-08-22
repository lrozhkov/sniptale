import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteObject: vi.fn(),
  initDB: vi.fn(),
  runMutation: vi.fn(),
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
}));

import {
  appendAssetOperationCompensation,
  buildPhysicalDeleteOperation,
  completePhysicalDeleteOperation,
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
});

function installMutationHarness(current: unknown = operation) {
  const put = vi.fn().mockResolvedValue(undefined);
  const store = { get: vi.fn().mockResolvedValue(current), put };
  const db = {
    add: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    transaction: vi.fn(() => ({ done: Promise.resolve(), objectStore: () => store })),
  };
  mocks.runMutation.mockImplementation(async (callback) => callback(db));
  return { db, put, store };
}

describe('durable asset operations', () => {
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
  });

  it('persists immutable archive identity and checkpoints a root in the caller transaction', async () => {
    const harness = installMutationHarness();
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
    await appendCommittedArchiveRootInTransaction(
      store,
      session.operationId,
      'media:library-item:one',
      'media-copy'
    );
    expect(store.put).toHaveBeenCalledWith(
      expect.objectContaining({
        committedRoots: ['media:library-item:one'],
        conflictedRoots: [],
        currentRoot: null,
        rootIdMap: { 'media:library-item:one': 'media-copy' },
        skippedRoots: [],
        strategy: 'duplicate',
      })
    );

    store.get = vi.fn().mockResolvedValue(session);
    await appendCommittedArchiveRootInTransaction(
      store,
      session.operationId,
      'media:library-item:one',
      'media-existing',
      false,
      true
    );
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
