import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const {
  usageIndex,
  publish,
  collect,
  provenance,
  backfill,
  drafts,
  trash,
  recover,
  settings,
  log,
} = vi.hoisted(() => ({
  log: vi.fn(),
  usageIndex: vi.fn(),
  publish: vi.fn(),
  collect: vi.fn(),
  provenance: vi.fn(),
  backfill: vi.fn(),
  drafts: vi.fn(async () => ({ deletedCount: 0, deletedIds: [] })),
  trash: vi.fn(),
  recover: vi.fn(),
  settings: vi.fn(async () => ({ localStoragePolicy: {} })),
}));
vi.mock('../../composition/persistence/library-lifecycle/maintenance-log', () => ({
  createMaintenanceLog: () => ({ append: log }),
}));
vi.mock('../../composition/persistence/media-library/usage-index-maintenance', () => ({
  maintainProjectUsageIndex: usageIndex,
}));
vi.mock('../../composition/persistence/infrastructure/indexed-db/maintenance/provenance', () => ({
  maintainProvenanceUrls: provenance,
}));
vi.mock('../../composition/persistence/scenario/library-publication', () => ({
  backfillScenarioLibraryAssets: backfill,
}));
vi.mock('../../composition/persistence/library-lifecycle/cleanup', () => ({
  cleanupDrafts: drafts,
}));
vi.mock('../../composition/persistence/settings', () => ({ loadSettings: settings }));
vi.mock('../../composition/persistence/asset-publication-recovery', () => ({
  recoverPendingAssetPublications: recover,
}));
vi.mock('./trash', () => ({ cleanupLibraryTrash: trash }));
vi.mock('../../composition/persistence/asset-publication-recovery/audit', () => ({
  collectOrphanAssetObjectsDuringIdle: collect,
}));
vi.mock('../../features/media-hub/events', () => ({ publishMediaHubLibraryChanged: publish }));
import { maintainLibraryAssets } from './maintenance';
beforeEach(() => {
  settings.mockResolvedValue({ localStoragePolicy: {} });
  trash.mockResolvedValue({ failedCount: 0 });
});
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
  expect(log).toHaveBeenCalledWith(
    expect.objectContaining({ operation: 'orphans', code: 'failed' })
  );
});

it('stops later housekeeping stages after cancellation during a slow pass', async () => {
  const abort = new AbortController();
  provenance.mockImplementationOnce(async () => {
    abort.abort();
  });
  await maintainLibraryAssets(abort.signal);
  expect(backfill).not.toHaveBeenCalled();
  expect(drafts).not.toHaveBeenCalled();
  expect(trash).not.toHaveBeenCalled();
  expect(recover).not.toHaveBeenCalled();
});

it('does not apply guessed retention when settings are unavailable', async () => {
  settings.mockRejectedValue(new Error('unavailable'));
  await maintainLibraryAssets(new AbortController().signal);
  expect(drafts).not.toHaveBeenCalled();
  expect(trash).not.toHaveBeenCalled();
  expect(collect).toHaveBeenCalledOnce();
});

it.each(['reported', 'thrown'] as const)(
  'reports %s Trash failures separately from snapshot loading',
  async (failure) => {
    const report = vi.fn();
    if (failure === 'reported') trash.mockResolvedValueOnce({ failedCount: 1 });
    else trash.mockRejectedValueOnce(new Error('delete failed'));
    await maintainLibraryAssets(new AbortController().signal, report);
    expect(report).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'trash', code: 'failed' })
    );
    expect(log).not.toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'trash', code: 'completed' })
    );
    expect(collect).toHaveBeenCalledOnce();
  }
);

it('discards a Trash failure that completes after maintenance cancellation', async () => {
  const abort = new AbortController();
  const report = vi.fn();
  trash.mockImplementationOnce(async () => {
    abort.abort();
    throw new Error('late failure');
  });
  await maintainLibraryAssets(abort.signal, report);
  expect(report).not.toHaveBeenCalled();
  expect(collect).not.toHaveBeenCalled();
});

it('refreshes advisory relationships after background indexing completes', async () => {
  usageIndex.mockResolvedValueOnce(true);
  await maintainLibraryAssets(new AbortController().signal);
  expect(publish).toHaveBeenCalledWith('sync', []);
});
