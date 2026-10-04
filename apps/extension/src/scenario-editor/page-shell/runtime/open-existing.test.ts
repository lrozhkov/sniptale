import { beforeEach, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({ list: vi.fn(), history: vi.fn() }));
vi.mock('../../../composition/persistence/scenario/store/public', () => ({
  listScenarioProjectSummaries: io.list,
}));
vi.mock('../../../composition/persistence/scenario/history', () => ({
  getScenarioSavedVersions: io.history,
}));
import { openExistingScenarioProject, readAvailableScenarioHistory } from './open-existing';

beforeEach(() => {
  io.list
    .mockReset()
    .mockResolvedValue([
      { id: 'guide', availability: 'available', lifecycle: { trashedAt: undefined } },
    ]);
  io.history.mockReset().mockResolvedValue({
    versions: [
      { project: { id: 'guide', name: 'Current' } },
      { project: { id: 'guide', name: 'Older' } },
    ],
  });
});

it('returns saved revisions in the same order as direct-link loading', async () => {
  await expect(readAvailableScenarioHistory('guide')).resolves.toEqual({
    current: { id: 'guide', name: 'Current' },
    previous: [{ id: 'guide', name: 'Older' }],
  });
});

it('acquires the resource session before reading saved history and opening the project', async () => {
  const enter = vi.fn(async () => true);
  const open = vi.fn(async () => {});
  await openExistingScenarioProject('guide', enter, open);
  expect(enter.mock.invocationCallOrder[0]).toBeLessThan(io.list.mock.invocationCallOrder[0]!);
  expect(io.list.mock.invocationCallOrder[0]).toBeLessThan(io.history.mock.invocationCallOrder[0]!);
  expect(io.history.mock.invocationCallOrder[0]).toBeLessThan(open.mock.invocationCallOrder[0]!);
  expect(open).toHaveBeenCalledWith({ id: 'guide', name: 'Current' }, [
    { id: 'guide', name: 'Older' },
  ]);
});

it('rejects a recent project moved to trash before activation', async () => {
  io.list.mockResolvedValue([
    { id: 'guide', availability: 'available', lifecycle: { trashedAt: 500 } },
  ]);
  await expect(readAvailableScenarioHistory('guide')).rejects.toThrow('unavailable');
  expect(io.history).not.toHaveBeenCalled();
});

it('rejects a removed or incompatible project', async () => {
  io.list.mockResolvedValue([]);
  await expect(readAvailableScenarioHistory('guide')).rejects.toThrow('unavailable');
  io.list.mockResolvedValue([{ id: 'guide', availability: 'unsupported' }]);
  await expect(readAvailableScenarioHistory('guide')).rejects.toThrow('unavailable');
});
