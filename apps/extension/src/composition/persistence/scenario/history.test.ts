import { beforeEach, expect, it, vi } from 'vitest';
import { createGuideProject } from '../../../features/scenario/project/public';
const io = vi.hoisted(() => ({ get: vi.fn(), commit: vi.fn(), publish: vi.fn() }));
vi.mock('./projects', () => ({ getScenarioProjectEntry: io.get }));
vi.mock('./aggregate-mutations', () => ({ commitScenarioAggregateMutation: io.commit }));
vi.mock('../../../features/media-hub/events', () => ({
  publishMediaHubLibraryChanged: io.publish,
}));
import { getScenarioSavedVersions, getScenarioEditingSnapshot } from './history';
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
it('returns null for a missing project and propagates read failures', async () => {
  io.get.mockResolvedValueOnce(undefined);
  expect(await getScenarioSavedVersions('guide')).toBeNull();
  const failure = new Error('Storage unavailable');
  io.get.mockRejectedValueOnce(failure);
  await expect(getScenarioSavedVersions('guide')).rejects.toBe(failure);
  expect(io.commit).not.toHaveBeenCalled();
});

it('loads exact editing navigation independently from saved-revision chronology', async () => {
  const editingHistory = {
    version: 1,
    past: [{ ...current, name: 'Past action' }],
    future: [{ ...current, name: 'Redo action' }],
  };
  io.get.mockResolvedValueOnce({
    project: current,
    workspaceRevision: 7,
    history: [{ revision: 1, savedAt: 1, project: previous }],
    editingHistory,
  });
  expect(await getScenarioEditingSnapshot('guide')).toEqual({
    project: current,
    workspaceRevision: 7,
    editingHistory,
  });
  expect(io.commit).not.toHaveBeenCalled();
});
it('keeps explicit empty checkpoints empty and derives past only for legacy entries', async () => {
  const empty = { version: 1, past: [], future: [] };
  io.get.mockResolvedValueOnce({
    project: current,
    workspaceRevision: 7,
    history: [{ revision: 1, savedAt: 1, project: previous }],
    editingHistory: empty,
  });
  expect((await getScenarioEditingSnapshot('guide'))?.editingHistory).toEqual(empty);
  expect((await getScenarioEditingSnapshot('guide'))?.editingHistory).toEqual({
    version: 1,
    past: [previous],
    future: [],
  });
});

it('keeps editing reads write-free and propagates missing or failed native reads', async () => {
  io.get.mockResolvedValueOnce(undefined);
  expect(await getScenarioEditingSnapshot('missing')).toBeNull();
  const failure = new Error('Native read refused');
  io.get.mockRejectedValueOnce(failure);
  await expect(getScenarioEditingSnapshot('guide')).rejects.toBe(failure);
  expect(io.commit).not.toHaveBeenCalled();
  expect(io.publish).not.toHaveBeenCalled();
});
