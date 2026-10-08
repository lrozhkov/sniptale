import { beforeEach, expect, it, vi } from 'vitest';
import { createVideoProjectEntryWithMediaClip } from '../projects/index.test-support';
import { maintainProjectUsageIndex } from './usage-index-maintenance';
import { USAGE_INDEX_MARKER } from './usage-index-keys';
const mocks = vi.hoisted(() => ({ initDB: vi.fn(), mutate: vi.fn(), ready: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: mocks.initDB,
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.mutate,
}));
vi.mock('./usage-index', () => ({ isProjectUsageIndexReady: mocks.ready }));
let current: object | undefined;
const put = vi.fn(async () => undefined);
const abort = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  current = createVideoProjectEntryWithMediaClip();
  mocks.ready.mockResolvedValue(false);
  const keys = vi.fn().mockResolvedValueOnce(['one']).mockResolvedValue([]);
  mocks.initDB.mockResolvedValue({ getAllKeys: keys });
  vi.stubGlobal('IDBKeyRange', { lowerBound: (key: unknown) => key });
  mocks.mutate.mockImplementation(async (write) =>
    write({
      transaction: () => ({
        store: { get: async () => current, put },
        done: Promise.resolve(),
        abort,
      }),
    })
  );
});
it('indexes a current row in its own mutation rather than publishing an earlier scan snapshot', async () => {
  const controller = new AbortController();
  const work = maintainProjectUsageIndex(controller.signal);
  current = { ...createVideoProjectEntryWithMediaClip({ name: 'Concurrent edit' }) };
  expect(await work).toBe(true);
  expect(put).toHaveBeenCalledWith(
    expect.objectContaining({
      project: expect.objectContaining({ name: 'Concurrent edit' }),
      usageReferenceKeys: expect.arrayContaining([USAGE_INDEX_MARKER]),
    })
  );
});
it('does not resurrect a row deleted after discovery', async () => {
  const work = maintainProjectUsageIndex(new AbortController().signal);
  current = undefined;
  expect(await work).toBe(false);
  expect(put).not.toHaveBeenCalled();
});
it('does not rewrite already indexed rows', async () => {
  current = { ...current, usageReferenceKeys: [USAGE_INDEX_MARKER] };
  expect(await maintainProjectUsageIndex(new AbortController().signal)).toBe(false);
  expect(put).not.toHaveBeenCalled();
});
it('cancels before mutation and avoids any scan when coverage is complete', async () => {
  const controller = new AbortController();
  const work = maintainProjectUsageIndex(controller.signal);
  controller.abort();
  expect(await work).toBe(false);
  expect(mocks.mutate).not.toHaveBeenCalled();
  mocks.ready.mockResolvedValue(true);
  expect(await maintainProjectUsageIndex(new AbortController().signal)).toBe(false);
  expect(mocks.mutate).not.toHaveBeenCalled();
});
it('aborts a failed transaction and propagates the failure to the advisory maintenance owner', async () => {
  put.mockRejectedValueOnce(new Error('Quota exceeded'));
  await expect(maintainProjectUsageIndex(new AbortController().signal)).rejects.toThrow(
    'Quota exceeded'
  );
  expect(abort).toHaveBeenCalledOnce();
});
