import { beforeEach, expect, it, vi } from 'vitest';

const persistenceMocks = vi.hoisted(() => ({
  listMediaLibrary: vi.fn(),
  listScenarioProjectEntries: vi.fn(),
  listVideoProjectEntries: vi.fn(),
  runWithIndexedDbMutation: vi.fn(),
}));

vi.mock('../projects/asset-publication', async (importOriginal) => ({
  ...(await importOriginal()),
  recoverProjectMediaPublications: vi.fn().mockResolvedValue(0),
}));
vi.mock('../recordings/asset-publication', async (importOriginal) => ({
  ...(await importOriginal()),
  recoverRecordingAssetPublications: vi.fn().mockResolvedValue(0),
}));

vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: persistenceMocks.runWithIndexedDbMutation,
}));
vi.mock('../media-library', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../media-library')>()),
  listMediaLibrary: persistenceMocks.listMediaLibrary,
}));
vi.mock('../projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../projects')>()),
  listVideoProjectEntries: persistenceMocks.listVideoProjectEntries,
}));
vi.mock('../scenario/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../scenario/projects')>()),
  listScenarioProjectEntries: persistenceMocks.listScenarioProjectEntries,
}));

import { cleanupDrafts, createLibraryLifecycle, DEFAULT_LOCAL_STORAGE_POLICY } from '.';

beforeEach(() => {
  vi.clearAllMocks();
  persistenceMocks.listScenarioProjectEntries.mockResolvedValue([]);
  persistenceMocks.listVideoProjectEntries.mockResolvedValue([]);
});

it('deletes an expired orphan project-asset blob and never schedules a library asset', async () => {
  const temporary = {
    createdAt: 1,
    duration: null,
    filename: 'orphan.png',
    height: 1,
    id: 'project-asset:orphan',
    kind: 'image',
    lifecycle: createLibraryLifecycle('temporary', 1),
    mimeType: 'image/png',
    originalFilename: 'orphan.png',
    size: 5,
    source: { kind: 'project-asset' as const, projectAssetId: 'orphan' },
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 1,
    width: 1,
  };
  const deletes = vi.fn();
  persistenceMocks.listMediaLibrary.mockResolvedValue([temporary]);
  persistenceMocks.runWithIndexedDbMutation.mockImplementationOnce(async (effect) =>
    effect({
      transaction: vi.fn(() => ({
        done: Promise.resolve(),
        objectStore: vi.fn((name: string) => ({
          delete: vi.fn(async (id: string) => deletes(name, id)),
          get: vi.fn(async () => temporary),
          getAll: vi.fn(async () => []),
        })),
      })),
    })
  );

  await expect(
    cleanupDrafts({ includeUnexpired: true, now: 2, policy: DEFAULT_LOCAL_STORAGE_POLICY })
  ).resolves.toEqual({
    deletedCount: 1,
    deletedIds: [temporary.id],
  });
  expect(deletes).toHaveBeenCalledWith('project_assets', 'orphan');

  persistenceMocks.listMediaLibrary.mockResolvedValue([
    { ...temporary, lifecycle: createLibraryLifecycle('library', 1) },
  ]);
  await expect(
    cleanupDrafts({ includeUnexpired: true, now: 2, policy: DEFAULT_LOCAL_STORAGE_POLICY })
  ).resolves.toEqual({ deletedCount: 0, deletedIds: [] });
  expect(persistenceMocks.runWithIndexedDbMutation).toHaveBeenCalledOnce();
});
