import { afterEach, expect, it, vi } from 'vitest';
const collect = vi.hoisted(() => vi.fn());
vi.mock('../../composition/persistence/asset-publication-recovery/audit', () => ({
  collectOrphanAssetObjectsDuringIdle: collect,
}));
import { maintainLibraryAssets } from './maintenance';
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
it('yields before maintenance and cancels on unmount or superseding refresh', async () => {
  vi.useFakeTimers();
  const abort = new AbortController();
  const work = maintainLibraryAssets(abort.signal);
  expect(collect).not.toHaveBeenCalled();
  abort.abort();
  await vi.advanceTimersByTimeAsync(16);
  await work;
  expect(collect).not.toHaveBeenCalled();
});
it('keeps maintenance failures advisory', async () => {
  collect.mockRejectedValueOnce(new Error('unavailable'));
  await expect(maintainLibraryAssets(new AbortController().signal)).resolves.toBeUndefined();
  expect(collect).toHaveBeenCalledOnce();
});
