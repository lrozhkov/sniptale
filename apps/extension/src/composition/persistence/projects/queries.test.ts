import { beforeEach, expect, it, vi } from 'vitest';
import { createVideoProjectEntryWithMediaClip } from './index.test-support';

const mocks = vi.hoisted(() => ({ getAll: vi.fn(), initDB: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: mocks.initDB,
}));
import { listVideoProjectEntries } from './queries';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.initDB.mockResolvedValue({ getAll: mocks.getAll });
});

it('filters invalid persisted rows and lists valid projects by descending update time', async () => {
  const older = createVideoProjectEntryWithMediaClip();
  older.updatedAt = 1;
  const newer = createVideoProjectEntryWithMediaClip();
  newer.updatedAt = 3;
  newer.id = 'newer';
  newer.project.id = 'newer';
  mocks.getAll.mockResolvedValue([older, { id: 'invalid' }, newer]);
  expect(await listVideoProjectEntries()).toEqual([
    { ...newer, lifecycle: { storageClass: 'library', savedAt: 3, updatedAt: 3 } },
    { ...older, lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1 } },
  ]);
  expect(mocks.getAll).toHaveBeenCalledExactlyOnceWith('video_projects');
});

it('propagates database and enumeration failures without treating them as an empty library', async () => {
  mocks.initDB.mockRejectedValueOnce(new Error('open failed'));
  await expect(listVideoProjectEntries()).rejects.toThrow('open failed');
  mocks.getAll.mockRejectedValueOnce(new Error('read failed'));
  await expect(listVideoProjectEntries()).rejects.toThrow('read failed');
  mocks.getAll.mockResolvedValueOnce([]);
  expect(await listVideoProjectEntries()).toEqual([]);
});
