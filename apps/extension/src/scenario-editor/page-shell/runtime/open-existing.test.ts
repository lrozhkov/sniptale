import { beforeEach, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({ list: vi.fn(), history: vi.fn() }));
vi.mock('../../../composition/persistence/scenario/store/public', () => ({
  listScenarioProjectSummaries: io.list,
}));
vi.mock('../../../composition/persistence/scenario/history', () => ({
  getScenarioEditingSnapshot: io.history,
}));
import { openExistingScenarioProject, readAvailableScenarioHistory } from './open-existing';

beforeEach(() => {
  io.list
    .mockReset()
    .mockResolvedValue([
      { id: 'guide', availability: 'available', lifecycle: { trashedAt: undefined } },
    ]);
  io.history.mockReset().mockResolvedValue({
    project: { id: 'guide', name: 'Current' },
    workspaceRevision: 17,
    editingHistory: {
      version: 1,
      past: [{ id: 'guide', name: 'Older' }],
      future: [{ id: 'guide', name: 'After' }],
    },
  });
});

it('returns exact current and both editing branches from the native snapshot', async () => {
  await expect(readAvailableScenarioHistory('guide')).resolves.toEqual({
    project: { id: 'guide', name: 'Current' },
    workspaceRevision: 17,
    editingHistory: {
      version: 1,
      past: [{ id: 'guide', name: 'Older' }],
      future: [{ id: 'guide', name: 'After' }],
    },
  });
});
it('acquires the resource session before reading and opening the editing snapshot', async () => {
  const enter = vi.fn(async () => true);
  const open = vi.fn(async () => {});
  await openExistingScenarioProject('guide', enter, open);
  expect(enter.mock.invocationCallOrder[0]).toBeLessThan(io.list.mock.invocationCallOrder[0]!);
  expect(io.list.mock.invocationCallOrder[0]).toBeLessThan(io.history.mock.invocationCallOrder[0]!);
  expect(io.history.mock.invocationCallOrder[0]).toBeLessThan(open.mock.invocationCallOrder[0]!);
  expect(open).toHaveBeenCalledWith({
    project: { id: 'guide', name: 'Current' },
    workspaceRevision: 17,
    editingHistory: {
      version: 1,
      past: [{ id: 'guide', name: 'Older' }],
      future: [{ id: 'guide', name: 'After' }],
    },
  });
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
  await expect(readAvailableScenarioHistory('guide')).rejects.toThrow('unsupported');
  expect(io.history).not.toHaveBeenCalled();
});

it('reports unsupported resource admission without opening or reading its history', async () => {
  io.list.mockResolvedValue([{ id: 'guide', availability: 'unsupported' }]);
  const enter = vi.fn(async () => {
    throw new Error('Unavailable guide cannot be pruned.');
  });
  const open = vi.fn();
  await expect(openExistingScenarioProject('guide', enter, open)).rejects.toThrow('unsupported');
  expect(io.history).not.toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();
  expect(enter.mock.invocationCallOrder[0]).toBeLessThan(io.list.mock.invocationCallOrder[0]!);
});

it('leaves a refused resource session closed without reading project metadata or history', async () => {
  const enter = vi.fn(async () => false);
  const open = vi.fn();
  await openExistingScenarioProject('guide', enter, open);
  expect(io.list).not.toHaveBeenCalled();
  expect(io.history).not.toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();
});
