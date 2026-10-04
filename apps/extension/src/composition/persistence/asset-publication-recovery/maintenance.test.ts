import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  snapshot: vi.fn(),
  objects: vi.fn(),
  journals: vi.fn(),
  writing: vi.fn(),
  lifecycle: vi.fn(),
  objectLock: vi.fn(),
  put: vi.fn(),
  complete: vi.fn(),
  init: vi.fn(),
}));
vi.mock('../assets/retention-authority', () => ({ collectDurableAssetSnapshot: mocks.snapshot }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: mocks.init,
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (effect: (db: { put: typeof mocks.put }) => Promise<unknown>) =>
    effect({ put: mocks.put }),
}));
vi.mock('../infrastructure/mutation-barrier', async (original) => ({
  ...(await original<typeof import('../infrastructure/mutation-barrier')>()),
  tryRunWithDurableAssetLifecycleLock: mocks.lifecycle,
}));
vi.mock('../assets', async (original) => ({
  ...(await original<typeof import('../assets')>()),
  listAssetObjectIds: mocks.objects,
  listReadyJournals: mocks.journals,
  listWritingAssetIds: mocks.writing,
  runWithAssetObjectLockIfAvailable: mocks.objectLock,
  completePhysicalDeleteOperation: mocks.complete,
}));
import { collectOrphanAssetObjectsDuringIdle } from './audit';

function emptySnapshot() {
  return {
    authorityValid: true,
    refs: [],
    owners: [],
    expectedOwners: [],
    expectedOwnerAssets: new Map(),
    protectedRollbackAssetIds: new Set<string>(),
    operationIds: new Set(),
    archiveSessions: [],
    embeddedBinaryMetadata: [],
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.snapshot.mockResolvedValue(emptySnapshot());
  mocks.objects.mockResolvedValue(['orphan']);
  mocks.journals.mockResolvedValue([]);
  mocks.writing.mockResolvedValue([]);
  mocks.lifecycle.mockImplementation(async (effect) => effect('test-permit'));
  mocks.objectLock.mockImplementation(async (_id, effect) => effect());
  mocks.put.mockResolvedValue(undefined);
  mocks.complete.mockResolvedValue(undefined);
});
it('discovers outside the lifecycle lock and records durable intent before physical deletion', async () => {
  mocks.lifecycle.mockImplementation(async (effect) => {
    expect(mocks.snapshot).toHaveBeenCalledOnce();
    return effect('test-permit');
  });
  mocks.complete.mockImplementation(async (operation, permit) => {
    expect(permit).toBe('test-permit');
    expect(mocks.put).toHaveBeenCalledWith('asset_operations', operation);
    expect(operation.assetIds).toEqual(['orphan']);
  });
  await collectOrphanAssetObjectsDuringIdle(new AbortController().signal);
  expect(mocks.complete).toHaveBeenCalledOnce();
});
it.each(['ref', 'owner', 'projected', 'rollback', 'writing', 'journal', 'invalid'])(
  'retains a candidate when %s authority appears before deletion',
  async (kind) => {
    const snapshot = emptySnapshot();
    const protectedSnapshot = {
      ...snapshot,
      authorityValid: kind !== 'invalid',
      refs: kind === 'ref' ? [{ assetId: 'orphan' }] : [],
      owners: kind === 'owner' ? [{ assetId: 'orphan' }] : [],
      expectedOwners: kind === 'projected' ? [{ assetId: 'orphan' }] : [],
      protectedRollbackAssetIds: new Set(kind === 'rollback' ? ['orphan'] : []),
    };
    mocks.snapshot.mockResolvedValueOnce(snapshot).mockResolvedValue(protectedSnapshot);
    if (kind === 'writing') mocks.writing.mockResolvedValueOnce([]).mockResolvedValue(['orphan']);
    if (kind === 'journal')
      mocks.journals
        .mockResolvedValueOnce([])
        .mockResolvedValue([{ assetRefs: [{ assetId: 'orphan' }], payload: {} }]);
    await collectOrphanAssetObjectsDuringIdle(new AbortController().signal);
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  }
);
it('skips busy lifecycle locks and stops when Gallery cancels the pass', async () => {
  mocks.lifecycle.mockResolvedValueOnce(null);
  await collectOrphanAssetObjectsDuringIdle(new AbortController().signal);
  expect(mocks.put).not.toHaveBeenCalled();
  const abort = new AbortController();
  mocks.objects.mockImplementationOnce(async () => {
    abort.abort();
    return ['orphan'];
  });
  await collectOrphanAssetObjectsDuringIdle(abort.signal);
  expect(mocks.lifecycle).toHaveBeenCalledOnce();
});
it('never deletes when durable intent fails to commit', async () => {
  mocks.put.mockRejectedValueOnce(new Error('write failed'));
  await expect(collectOrphanAssetObjectsDuringIdle(new AbortController().signal)).rejects.toThrow(
    'write failed'
  );
  expect(mocks.complete).not.toHaveBeenCalled();
});
