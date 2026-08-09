import { describe, expect, it, vi } from 'vitest';

const {
  createGalleryItemsMock,
  getStorageEstimateInfoMock,
  listMediaLibraryMock,
  listMediaThumbnailIdsMock,
  listVideoProjectsMock,
  listScenarioExportRecordsMock,
  listScenarioProjectSummariesMock,
  loadSettingsMock,
  listEditorSessionDraftsMock,
} = vi.hoisted(() => ({
  createGalleryItemsMock: vi.fn(),
  getStorageEstimateInfoMock: vi.fn(),
  listMediaLibraryMock: vi.fn(),
  listMediaThumbnailIdsMock: vi.fn(),
  listVideoProjectsMock: vi.fn(),
  listScenarioExportRecordsMock: vi.fn(),
  listScenarioProjectSummariesMock: vi.fn(),
  loadSettingsMock: vi.fn(),
  listEditorSessionDraftsMock: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../composition/persistence/editor-sessions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/editor-sessions')>()),
  listEditorSessionDrafts: listEditorSessionDraftsMock,
}));

vi.mock('../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/settings')>()),
  loadSettings: loadSettingsMock,
}));

vi.mock('../../composition/persistence/media-library/index.library.ts', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../composition/persistence/media-library/index.library.ts')
  >()),
  listMediaLibrary: listMediaLibraryMock,
  listMediaThumbnailIds: listMediaThumbnailIdsMock,
}));

vi.mock('../../composition/persistence/projects/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/projects/index')>()),
  listVideoProjects: listVideoProjectsMock,
}));

vi.mock(
  '../../composition/persistence/scenario/store/project-records/exports',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../composition/persistence/scenario/store/project-records/exports')
    >()),
    listScenarioExportRecords: listScenarioExportRecordsMock,
  })
);

vi.mock(
  '../../composition/persistence/scenario/store/project-records/index',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../composition/persistence/scenario/store/project-records/index')
    >()),
    listScenarioProjectSummaries: listScenarioProjectSummariesMock,
  })
);

vi.mock('../../features/media-hub/storage-capacity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/media-hub/storage-capacity')>()),
  getStorageEstimateInfo: getStorageEstimateInfoMock,
}));

vi.mock('../library/items', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../library/items')>()),
  createGalleryItems: createGalleryItemsMock,
}));

import { loadGalleryLibrarySnapshot } from './use-gallery-library-snapshot';

describe('loadGalleryLibrarySnapshot', () => {
  it('loads mixed gallery items and storage estimates without legacy read-path repair', async () => {
    const mediaItems = [{ id: 'asset-1' }];
    const scenarioProjects = [{ id: 'project-1', name: 'Scenario', createdAt: 1, updatedAt: 2 }];
    const scenarioExports = [{ id: 'export-1', projectId: 'project-1' }];
    const videoProjects = [{ id: 'video-project-1', name: 'Video', createdAt: 3, updatedAt: 4 }];
    const thumbnailIds = ['asset-1', 'scenario:project-1'];
    const nextItems = [{ id: 'asset-1' }, { id: 'scenario:project-1' }];
    const estimate = { quota: 20, usage: 10 };

    listMediaLibraryMock.mockResolvedValue(mediaItems);
    listVideoProjectsMock.mockResolvedValue(videoProjects);
    listScenarioProjectSummariesMock.mockResolvedValue(scenarioProjects);
    listScenarioExportRecordsMock.mockResolvedValue(scenarioExports);
    listMediaThumbnailIdsMock.mockResolvedValue(thumbnailIds);
    getStorageEstimateInfoMock.mockResolvedValue(estimate);
    createGalleryItemsMock.mockReturnValue(nextItems);
    loadSettingsMock.mockResolvedValue({
      localStoragePolicy: {
        cleanupEnabled: true,
        defaultDestination: 'temporary',
        draftRetentionDays: 30,
        videoDraftRetentionDays: 7,
      },
    });

    await expect(loadGalleryLibrarySnapshot()).resolves.toEqual({ estimate, nextItems });
    expect(listMediaLibraryMock).toHaveBeenCalledTimes(1);
    expect(listVideoProjectsMock).toHaveBeenCalledTimes(1);
    expect(listScenarioProjectSummariesMock).toHaveBeenCalledTimes(1);
    expect(listScenarioExportRecordsMock).toHaveBeenCalledWith('project-1');
    expect(listMediaThumbnailIdsMock).toHaveBeenCalledTimes(1);
    expect(getStorageEstimateInfoMock).toHaveBeenCalledTimes(1);
    expect(createGalleryItemsMock).toHaveBeenCalledWith({
      editorSessions: [],
      mediaItems,
      scenarioExportsByProjectId: new Map([['project-1', scenarioExports]]),
      scenarioProjects,
      thumbnailIds: new Set(thumbnailIds),
      videoProjects,
    });
  });

  it('computes separate expiration dates for ordinary and recording drafts', async () => {
    listMediaLibraryMock.mockResolvedValue([]);
    listVideoProjectsMock.mockResolvedValue([]);
    listScenarioProjectSummariesMock.mockResolvedValue([]);
    listMediaThumbnailIdsMock.mockResolvedValue([]);
    getStorageEstimateInfoMock.mockResolvedValue({ quota: 100, usage: 20 });
    loadSettingsMock.mockResolvedValue({
      localStoragePolicy: {
        cleanupEnabled: true,
        defaultDestination: 'temporary',
        draftRetentionDays: 30,
        videoDraftRetentionDays: 7,
      },
    });
    createGalleryItemsMock.mockReturnValue([
      {
        id: 'image-1',
        lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 1_000 },
        source: { kind: 'screenshot' },
        type: 'media',
      },
      {
        id: 'video-1',
        lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 2_000 },
        source: { kind: 'recording', recordingId: 'recording-1' },
        type: 'media',
      },
      {
        id: 'library-1',
        lifecycle: { savedAt: 3_000, storageClass: 'library', updatedAt: 3_000 },
        source: { kind: 'screenshot' },
        type: 'media',
      },
    ]);

    const result = await loadGalleryLibrarySnapshot();
    expect(result.nextItems).toEqual([
      expect.objectContaining({ expiresAt: 1_000 + 30 * 24 * 60 * 60 * 1_000 }),
      expect.objectContaining({ expiresAt: 2_000 + 7 * 24 * 60 * 60 * 1_000 }),
      expect.objectContaining({ id: 'library-1' }),
    ]);
  });
});
