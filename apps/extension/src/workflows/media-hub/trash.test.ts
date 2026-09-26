import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_LOCAL_STORAGE_POLICY } from '../../composition/persistence/library-lifecycle/policy';

const mocks = vi.hoisted(() => ({
  media: vi.fn(),
  videos: vi.fn(),
  scenarios: vi.fn(),
  usage: vi.fn(),
  guard: vi.fn(),
  deleteMedia: vi.fn(),
  deleteVideo: vi.fn(),
  deleteScenario: vi.fn(),
  publish: vi.fn(),
}));
vi.mock('../../composition/persistence/library-lifecycle/trash', () => ({
  moveStoredItemsToTrash: vi.fn(),
  restoreStoredItemsFromTrash: vi.fn(),
  runWithTrashedStoredItem: mocks.guard,
  StaleTrashItemError: class extends Error {},
}));
vi.mock('../../composition/persistence/media-library', () => ({ listMediaLibrary: mocks.media }));
vi.mock('../../composition/persistence/projects', () => ({
  listVideoProjectEntries: mocks.videos,
}));
vi.mock('../../composition/persistence/scenario/projects', () => ({
  listScenarioProjectEntries: mocks.scenarios,
}));
vi.mock('../../composition/persistence/scenario/store/public', () => ({
  deleteScenarioProjectRecord: mocks.deleteScenario,
}));
vi.mock('../../composition/persistence/media-library/usage', () => ({
  listMediaAssetProjectUsage: mocks.usage,
}));
vi.mock('./store', () => ({ deleteMediaLibraryAssetsBatchSafely: mocks.deleteMedia }));
vi.mock('./video-projects', () => ({ deletePersistedVideoProject: mocks.deleteVideo }));
vi.mock('../../features/media-hub/events', () => ({
  publishMediaHubLibraryChanged: mocks.publish,
}));
import { cleanupLibraryTrash, permanentlyDeleteTrashItem } from './trash';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.media.mockResolvedValue([]);
  mocks.videos.mockResolvedValue([]);
  mocks.scenarios.mockResolvedValue([]);
  mocks.usage.mockResolvedValue([]);
  mocks.guard.mockImplementation(async (_target, _timestamp, action: () => Promise<void>) =>
    action()
  );
});

it('default and legacy policies never enumerate or delete trash', async () => {
  await cleanupLibraryTrash(DEFAULT_LOCAL_STORAGE_POLICY);
  await cleanupLibraryTrash({
    cleanupEnabled: true,
    defaultDestination: 'temporary',
    draftRetentionDays: 1,
    videoDraftRetentionDays: 1,
  });
  expect(mocks.media).not.toHaveBeenCalled();
  expect(mocks.guard).not.toHaveBeenCalled();
});

it('purges only expired trash by admission time and retains referenced media', async () => {
  mocks.media.mockResolvedValue([
    { id: 'expired', lifecycle: { trashedAt: 1, updatedAt: 10 * 86_400_000 } },
    { id: 'recent', lifecycle: { trashedAt: 9 * 86_400_000 } },
    { id: 'live', lifecycle: { updatedAt: 1 } },
    { id: 'referenced', lifecycle: { trashedAt: 1 } },
  ]);
  mocks.usage.mockImplementation(async (id: string) =>
    id === 'referenced' ? [{ id: 'project' }] : []
  );
  await cleanupLibraryTrash(
    { ...DEFAULT_LOCAL_STORAGE_POLICY, trashCleanupEnabled: true, trashRetentionDays: 7 },
    10 * 86_400_000
  );
  expect(mocks.deleteMedia).toHaveBeenCalledExactlyOnceWith(
    ['expired'],
    new Map([['expired', []]])
  );
  expect(mocks.guard).toHaveBeenCalledWith(
    { kind: 'media', id: 'expired' },
    1,
    expect.any(Function)
  );
});

it('revalidates trash admission before invoking any destructive owner', async () => {
  mocks.guard.mockRejectedValueOnce(new Error('restored'));
  await expect(
    permanentlyDeleteTrashItem({ target: { kind: 'video-project', id: 'v' }, trashedAt: 1 })
  ).rejects.toThrow('restored');
  expect(mocks.deleteVideo).not.toHaveBeenCalled();
});

it('continues after a failed purge and reports retained failures', async () => {
  mocks.scenarios.mockResolvedValue([
    { id: 'a', lifecycle: { trashedAt: 1 } },
    { id: 'b', lifecycle: { trashedAt: 1 } },
  ]);
  mocks.deleteScenario.mockRejectedValueOnce(new Error('storage'));
  expect(
    await cleanupLibraryTrash(
      { ...DEFAULT_LOCAL_STORAGE_POLICY, trashCleanupEnabled: true, trashRetentionDays: 1 },
      2 * 86_400_000
    )
  ).toEqual({ failedCount: 1 });
  expect(mocks.deleteScenario).toHaveBeenCalledTimes(2);
});

it('always preserves independent exports during manual or automatic parent purge', async () => {
  await permanentlyDeleteTrashItem({
    target: { kind: 'video-project', id: 'parent' },
    trashedAt: 1,
  });
  expect(mocks.deleteVideo).toHaveBeenCalledWith('parent', { preserveExports: true });
});
