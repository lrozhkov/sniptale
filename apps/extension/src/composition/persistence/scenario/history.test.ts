import { beforeEach, expect, it, vi } from 'vitest';
import { createGuideProject } from '../../../features/scenario/project/public';
const io = vi.hoisted(() => ({ get: vi.fn(), commit: vi.fn(), publish: vi.fn() }));
vi.mock('./projects', () => ({ getScenarioProjectEntry: io.get }));
vi.mock('./aggregate-mutations', () => ({ commitScenarioAggregateMutation: io.commit }));
vi.mock('../../../features/media-hub/events', () => ({
  publishMediaHubLibraryChanged: io.publish,
}));
import { getScenarioSavedVersions, restoreScenarioSavedVersion } from './history';
const previous = createGuideProject('Previous', 'guide', 1);
const current = { ...previous, name: 'Current', updatedAt: 2 };
beforeEach(() => {
  vi.clearAllMocks();
  io.get.mockResolvedValue({
    project: current,
    workspaceRevision: 2,
    history: [{ revision: 1, savedAt: 1, project: previous }],
  });
  io.commit.mockResolvedValue({ project: { ...previous, updatedAt: 3 }, workspaceRevision: 3 });
});
it('lists the current committed version followed by previous versions after reopening', async () => {
  expect(await getScenarioSavedVersions('guide')).toEqual({
    currentRevision: 2,
    versions: [
      { revision: 2, savedAt: 2, project: current },
      { revision: 1, savedAt: 1, project: previous },
    ],
  });
});
it('restores only an existing stored version via the page base revision and a new publication', async () => {
  const result = await restoreScenarioSavedVersion({
    projectId: 'guide',
    revision: 1,
    baseUpdatedAt: 2,
  });
  expect(io.commit).toHaveBeenCalledWith(previous, { expectedUpdatedAt: 2 });
  expect(result.updatedAt).toBe(3);
  expect(result.name).toBe('Previous');
  expect(io.publish).toHaveBeenCalledOnce();
});
it('rejects unavailable versions before publication and propagates CAS or quota failure', async () => {
  await expect(
    restoreScenarioSavedVersion({ projectId: 'guide', revision: 9, baseUpdatedAt: 2 })
  ).rejects.toThrow('unavailable');
  expect(io.commit).not.toHaveBeenCalled();
  const conflict = new Error('Changed in another tab');
  conflict.name = 'StaleScenarioAggregateRevisionError';
  io.commit.mockRejectedValueOnce(conflict);
  await expect(
    restoreScenarioSavedVersion({ projectId: 'guide', revision: 1, baseUpdatedAt: 1 })
  ).rejects.toBe(conflict);
  expect(io.publish).not.toHaveBeenCalled();
  io.get.mockResolvedValueOnce(undefined);
  await expect(getScenarioSavedVersions('guide')).rejects.toThrow('unavailable');
});
