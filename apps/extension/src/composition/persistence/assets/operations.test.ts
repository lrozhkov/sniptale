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
});
