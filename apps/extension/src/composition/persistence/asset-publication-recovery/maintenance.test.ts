import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  snapshot: vi.fn(),
  objects: vi.fn(),
  journals: vi.fn(),
  writing: vi.fn(),
  lifecycle: vi.fn(),
  objectLock: vi.fn(),
  keys: vi.fn(),
  batch: vi.fn(),
}));
vi.mock('../assets/retention-authority', () => ({ collectDurableAssetSnapshot: mocks.snapshot }));
vi.mock('../assets/operations', async (original) => ({
  ...(await original<typeof import('../assets/operations')>()),
  deleteOrphanAssetObjectBatch: mocks.batch,
}));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: async () => ({ getAllKeys: mocks.keys }),
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
}));
import { collectOrphanAssetObjectsDuringIdle } from './audit';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.objects.mockResolvedValue(['orphan']);
  mocks.keys.mockResolvedValue([]);
  mocks.journals.mockResolvedValue([]);
  mocks.writing.mockResolvedValue([]);
  mocks.lifecycle.mockImplementation(async (effect) => effect('permit'));
  mocks.objectLock.mockImplementation(async (_id, effect) => effect());
});
it('discovers by IDs and gives one batch to the deletion owner while all object locks remain held', async () => {
  const locked = new Set<string>();
  mocks.objects.mockResolvedValue(['one', 'busy', 'two']);
  mocks.objectLock.mockImplementation(async (id, effect) => {
    if (id === 'busy') return;
    locked.add(id);
    try {
      await effect();
    } finally {
      locked.delete(id);
    }
  });
  mocks.batch.mockImplementation(async (ids, _signal, permit) => {
    expect(ids).toEqual(['one', 'two']);
    expect(locked).toEqual(new Set(ids));
    expect(permit).toBe('permit');
  });
  await collectOrphanAssetObjectsDuringIdle(new AbortController().signal);
  expect(mocks.batch).toHaveBeenCalledOnce();
  expect(mocks.snapshot).not.toHaveBeenCalled();
  expect(locked.size).toBe(0);
});
it.each(['ref', 'writing', 'journal'])(
  'does no validation when a candidate has %s protection',
  async (kind) => {
    if (kind === 'ref') mocks.keys.mockResolvedValue(['orphan']);
    if (kind === 'writing') mocks.writing.mockResolvedValue(['orphan']);
    if (kind === 'journal')
      mocks.journals.mockResolvedValue([{ assetRefs: [{ assetId: 'orphan' }], payload: {} }]);
    await collectOrphanAssetObjectsDuringIdle(new AbortController().signal);
    expect(mocks.batch).not.toHaveBeenCalled();
    expect(mocks.lifecycle).not.toHaveBeenCalled();
    expect(mocks.snapshot).not.toHaveBeenCalled();
  }
);
it('bounds candidate admission to 32 and skips busy lifecycle locks', async () => {
  mocks.objects.mockResolvedValue(Array.from({ length: 100 }, (_, i) => `object-${i}`));
  await collectOrphanAssetObjectsDuringIdle(new AbortController().signal);
  expect(mocks.batch.mock.calls[0]![0]).toHaveLength(32);
  mocks.lifecycle.mockResolvedValueOnce(undefined);
  await collectOrphanAssetObjectsDuringIdle(new AbortController().signal);
  expect(mocks.batch).toHaveBeenCalledOnce();
});
it('cancels before taking lifecycle or object locks', async () => {
  const controller = new AbortController();
  mocks.objects.mockImplementationOnce(async () => {
    controller.abort();
    return ['orphan'];
  });
  await collectOrphanAssetObjectsDuringIdle(controller.signal);
  expect(mocks.lifecycle).not.toHaveBeenCalled();
  expect(mocks.batch).not.toHaveBeenCalled();
});
it('releases all acquired locks when authoritative deletion fails', async () => {
  const released = vi.fn();
  mocks.objectLock.mockImplementation(async (_id, effect) => {
    try {
      await effect();
    } finally {
      released();
    }
  });
  mocks.batch.mockRejectedValueOnce(new Error('write failed'));
  await expect(collectOrphanAssetObjectsDuringIdle(new AbortController().signal)).rejects.toThrow(
    'write failed'
  );
  expect(released).toHaveBeenCalledOnce();
});
