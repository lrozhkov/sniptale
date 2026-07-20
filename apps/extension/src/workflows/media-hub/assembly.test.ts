import { beforeEach, describe, expect, it, vi } from 'vitest';

const cleanupAssemblyMocks = vi.hoisted(() => ({
  buildCleanupCandidatesMock: vi.fn(),
  buildStorageCleanupReportMock: vi.fn(),
  initDBMock: vi.fn(),
  listAllProjectExportsMock: vi.fn(),
  listMediaLibraryMock: vi.fn(),
  listProjectAssetsMock: vi.fn(),
  listRecordingsMock: vi.fn(),
  listVideoProjectReadResultsMock: vi.fn(),
}));

vi.mock('../../composition/persistence/infrastructure/indexed-db/core', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  EDITOR_SESSIONS_STORE: 'editor_sessions',
  SCENARIO_ASSETS_STORE: 'scenario_assets',
  SCENARIO_EXPORTS_STORE: 'scenario_exports',
  SCENARIO_PROJECTS_STORE: 'scenario_projects',
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE: 'scenario_step_editor_documents',
  THUMBNAILS_STORE: 'thumbnails',
  VIDEO_PROJECTS_STORE: 'video_projects',
  WEB_SNAPSHOTS_STORE: 'web_snapshots',
  initDB: cleanupAssemblyMocks.initDBMock,
}));

vi.mock('../../composition/persistence/media-library/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/media-library/index')>()),
  listMediaLibrary: cleanupAssemblyMocks.listMediaLibraryMock,
}));

vi.mock('../../composition/persistence/recordings/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/recordings/index')>()),
  listRecordings: cleanupAssemblyMocks.listRecordingsMock,
}));

vi.mock('../../composition/persistence/projects/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/projects/index')>()),
  listAllProjectExports: cleanupAssemblyMocks.listAllProjectExportsMock,
  listProjectAssets: cleanupAssemblyMocks.listProjectAssetsMock,
  listVideoProjectReadResults: cleanupAssemblyMocks.listVideoProjectReadResultsMock,
}));

vi.mock('./cleanup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./cleanup')>()),
  buildCleanupCandidates: cleanupAssemblyMocks.buildCleanupCandidatesMock,
}));

vi.mock('../../features/media-hub/report', () => ({
  buildStorageCleanupReport: cleanupAssemblyMocks.buildStorageCleanupReportMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  cleanupAssemblyMocks.initDBMock.mockResolvedValue({ getAll: vi.fn().mockResolvedValue([]) });
  cleanupAssemblyMocks.listMediaLibraryMock.mockResolvedValue([{ id: 'asset-1' }]);
  cleanupAssemblyMocks.listRecordingsMock.mockResolvedValue([{ id: 'recording-1' }]);
  cleanupAssemblyMocks.listAllProjectExportsMock.mockResolvedValue([{ id: 'export-1' }]);
  cleanupAssemblyMocks.listProjectAssetsMock.mockResolvedValue([{ id: 'project-asset-1' }]);
  cleanupAssemblyMocks.listVideoProjectReadResultsMock.mockResolvedValue([
    {
      project: { id: 'project-1' },
      status: 'ready',
    },
  ]);
  cleanupAssemblyMocks.buildCleanupCandidatesMock.mockReturnValue({
    orphanedRawRecordings: [],
    orphanedProjectAssets: [],
    heavyFiles: [],
    oldScreenshots: [],
  });
  cleanupAssemblyMocks.buildStorageCleanupReportMock.mockReturnValue({
    groups: [],
    potentialBytes: 0,
  });
});

describe('media-hub-cleanup-assembly', () => {
  it('collects cleanup candidates from read-only catalog stores', async () => {
    const { collectStorageCleanupReport } = await import('./assembly');

    await expect(collectStorageCleanupReport(5)).resolves.toEqual({
      groups: [],
      potentialBytes: 0,
    });

    expect(cleanupAssemblyMocks.buildCleanupCandidatesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaItems: [{ id: 'asset-1' }],
        projectAssets: [{ id: 'project-asset-1' }],
        projectDetails: [{ id: 'project-1' }],
        projectExports: [{ id: 'export-1' }],
        recordings: [{ id: 'recording-1' }],
        rawInventory: expect.objectContaining({ webSnapshots: [] }),
        topN: 5,
      })
    );
    expect(cleanupAssemblyMocks.buildStorageCleanupReportMock).toHaveBeenCalledWith({
      heavyFiles: [],
      oldScreenshots: [],
      orphanedProjectAssets: [],
      orphanedRawRecordings: [],
      topN: 5,
    });
  });

  it('excludes unavailable project details from cleanup candidates', async () => {
    cleanupAssemblyMocks.listVideoProjectReadResultsMock.mockResolvedValueOnce([
      { status: 'notFound' },
    ]);

    const { collectStorageCleanupReport } = await import('./assembly');
    await collectStorageCleanupReport();

    expect(cleanupAssemblyMocks.buildCleanupCandidatesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectDetails: [],
        topN: 10,
      })
    );
  });
});
