import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
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
  mocks.initDB.mockResolvedValue({
    transaction: () => ({
      done: Promise.resolve(),
      abort: vi.fn(),
      objectStore: () => ({ getAll: mocks.getAll, getAllKeys: vi.fn() }),
    }),
  });
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
  expect(mocks.getAll).toHaveBeenCalledExactlyOnceWith(undefined, 512);
});

it('propagates database and enumeration failures without treating them as an empty library', async () => {
  mocks.initDB.mockRejectedValueOnce(new Error('open failed'));
  await expect(listVideoProjectEntries()).rejects.toThrow('open failed');
  mocks.getAll.mockRejectedValueOnce(new Error('read failed'));
  await expect(listVideoProjectEntries()).rejects.toThrow('read failed');
  mocks.getAll.mockResolvedValueOnce([]);
  expect(await listVideoProjectEntries()).toEqual([]);
});

it('limits native project enumeration to bounded requests', async () => {
  const row = createVideoProjectEntryWithMediaClip();
  mocks.getAll.mockResolvedValue([row]);
  const getAll = vi.fn().mockResolvedValue([row]);
  const getAllKeys = vi.fn().mockResolvedValue([row.id]);
  mocks.initDB.mockResolvedValue({
    getAll: mocks.getAll,
    transaction: () => ({
      done: Promise.resolve(),
      abort: vi.fn(),
      objectStore: () => ({ getAll, getAllKeys }),
    }),
  });
  expect(await listVideoProjectEntries()).toHaveLength(1);
  expect(mocks.getAll).not.toHaveBeenCalled();
  expect(getAll).toHaveBeenCalledWith(undefined, 512);
});

it('keeps filtering and stable update order across pages and rejects a late read failure', async () => {
  vi.stubGlobal('IDBKeyRange', {
    lowerBound: (lower: IDBValidKey, lowerOpen: boolean) => ({ lower, lowerOpen }),
  });
  try {
    const fixture = createReviewWorkspaceStoreFixture(() => false);
    const rows = fixture.rows.get('video_projects')!;
    const expected: ReturnType<typeof createVideoProjectEntryWithMediaClip>[] = [];
    for (let index = 1024; index >= 0; index--) {
      const id = `project-${String(index).padStart(4, '0')}`;
      const entry = createVideoProjectEntryWithMediaClip({ id });
      entry.updatedAt = index % 3;
      rows.set(id, index === 512 ? { id } : entry);
      if (index !== 512) expected.push(entry);
    }
    mocks.initDB.mockResolvedValue(fixture.database);
    const result = await listVideoProjectEntries();
    expect(result.map((entry) => entry.id)).toEqual(
      expected
        .sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id))
        .map((entry) => entry.id)
    );
    expect(result).toHaveLength(1024);
    const abort = vi.fn();
    const getAll = vi
      .fn()
      .mockResolvedValueOnce(Array.from({ length: 512 }, () => rows.values().next().value));
    getAll.mockRejectedValueOnce(new Error('late page failed'));
    mocks.initDB.mockResolvedValue({
      transaction: () => ({
        abort,
        done: Promise.resolve(),
        objectStore: () => ({ getAll, getAllKeys: async () => Array(512).fill('last-key') }),
      }),
    });
    await expect(listVideoProjectEntries()).rejects.toThrow('late page failed');
    expect(abort).toHaveBeenCalledOnce();
    mocks.initDB.mockResolvedValue(fixture.database);
    expect(await listVideoProjectEntries()).toHaveLength(1024);
  } finally {
    vi.unstubAllGlobals();
  }
});
