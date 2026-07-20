import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deletePersistedProject } from './delete';

const {
  deleteProjectExport,
  deleteRecording,
  deleteMediaThumbnail,
  deleteVideoProject,
  deleteVideoPreviewCacheProjectRecords,
  listProjectExports,
  listVideoProjects,
} = vi.hoisted(() => ({
  deleteProjectExport: vi.fn(),
  deleteRecording: vi.fn(),
  deleteMediaThumbnail: vi.fn(),
  deleteVideoProject: vi.fn(),
  deleteVideoPreviewCacheProjectRecords: vi.fn(),
  listProjectExports: vi.fn(),
  listVideoProjects: vi.fn(),
}));

vi.mock('../../../composition/persistence/media-library/index', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/media-library/index')
  >()),

  deleteMediaThumbnail,
}));

vi.mock('../../../composition/persistence/projects/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/projects/index')>()),

  deleteProjectExport,
  listProjectExports,
  listVideoProjects,
  deleteVideoProject,
}));

vi.mock('../../../composition/persistence/recordings/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/recordings/index')>()),

  deleteRecording,
}));

vi.mock('../../../composition/persistence/video-preview-cache', () => ({
  deleteVideoPreviewCacheProjectRecords,
}));

describe('deletePersistedProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteVideoPreviewCacheProjectRecords.mockResolvedValue({ removedCount: 0 });
  });

  it('deletes export artifacts and project thumbnails before removing the project record', async () => {
    deleteVideoProject.mockResolvedValue(['asset-1']);
    listProjectExports.mockResolvedValue([
      { id: 'export-1', recordingId: 'recording-1' },
      { id: 'export-2', recordingId: 'recording-2' },
    ]);
    listVideoProjects.mockResolvedValue([{ id: 'remaining-project' }]);

    await expect(deletePersistedProject('project-1')).resolves.toEqual([
      { id: 'remaining-project' },
    ]);

    expect(deleteProjectExport).toHaveBeenCalledWith('export-1');
    expect(deleteProjectExport).toHaveBeenCalledWith('export-2');
    expect(deleteRecording).toHaveBeenCalledWith('recording-1');
    expect(deleteRecording).toHaveBeenCalledWith('recording-2');
    expect(deleteMediaThumbnail).toHaveBeenCalledWith('project-asset:asset-1');
    expect(deleteMediaThumbnail).toHaveBeenCalledWith('export:export-1');
    expect(deleteMediaThumbnail).toHaveBeenCalledWith('export:export-2');
    expect(deleteVideoProject).toHaveBeenCalledWith('project-1');
  });

  it('preserves project asset thumbnails when the database keeps shared assets', async () => {
    deleteVideoProject.mockResolvedValue([]);
    listProjectExports.mockResolvedValue([]);
    listVideoProjects.mockResolvedValue([]);

    await deletePersistedProject('project-1');

    expect(deleteMediaThumbnail).toHaveBeenCalledWith('video-project:project-1');
    expect(deleteMediaThumbnail).not.toHaveBeenCalledWith('project-asset:asset-1');
  });
});
