import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteMediaThumbnail: vi.fn(),
  deleteProjectExport: vi.fn(),
  deleteRecording: vi.fn(),
  deleteVideoPreviewCacheProjectRecords: vi.fn(),
  deleteVideoProject: vi.fn(),
  listProjectExports: vi.fn(),
  listVideoProjects: vi.fn(),
  publishMediaHubLibraryChanged: vi.fn(),
}));

vi.mock('../../composition/persistence/video-preview-cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/video-preview-cache')>()),
  deleteVideoPreviewCacheProjectRecords: mocks.deleteVideoPreviewCacheProjectRecords,
}));
vi.mock('../../composition/persistence/media-library/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/media-library/index')>()),
  deleteMediaThumbnail: mocks.deleteMediaThumbnail,
}));
vi.mock('../../composition/persistence/projects/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/projects/index')>()),
  deleteProjectExport: mocks.deleteProjectExport,
  deleteVideoProject: mocks.deleteVideoProject,
  listProjectExports: mocks.listProjectExports,
  listVideoProjects: mocks.listVideoProjects,
}));
vi.mock('../../composition/persistence/recordings/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/recordings/index')>()),
  deleteRecording: mocks.deleteRecording,
}));
vi.mock('../../features/media-hub/storage-errors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/media-hub/storage-errors')>()),
  withMediaHubWriteGuard: (_label: string, operation: () => Promise<void>) => operation(),
}));
vi.mock('../../features/media-hub/events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/media-hub/events')>()),
  publishMediaHubLibraryChanged: mocks.publishMediaHubLibraryChanged,
}));
vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { deletePersistedVideoProject } from './video-projects';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deleteVideoPreviewCacheProjectRecords.mockResolvedValue({ removedCount: 1 });
  mocks.deleteVideoProject.mockResolvedValue([]);
  mocks.listProjectExports.mockResolvedValue([]);
  mocks.listVideoProjects.mockResolvedValue([]);
});

it('verifies derived preview deletion before authoritative project deletion', async () => {
  await deletePersistedVideoProject('project-1');

  expect(mocks.deleteVideoPreviewCacheProjectRecords).toHaveBeenCalledWith('project-1');
  expect(mocks.deleteVideoPreviewCacheProjectRecords.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.deleteVideoProject.mock.invocationCallOrder[0] ?? 0
  );
});

it('aborts authoritative deletion when derived preview deletion fails', async () => {
  mocks.deleteVideoPreviewCacheProjectRecords.mockRejectedValue(new Error('cache deletion failed'));

  await expect(deletePersistedVideoProject('project-1')).rejects.toThrow('cache deletion failed');
  expect(mocks.deleteVideoProject).not.toHaveBeenCalled();
  expect(mocks.publishMediaHubLibraryChanged).not.toHaveBeenCalled();
});
