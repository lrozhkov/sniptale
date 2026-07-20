import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMediaLibraryEntry,
  createProjectAssetEntry,
  createProjectExportEntry,
  createVideoProject,
  createVideoProjectEntry,
  createVideoProjectEntryWithMediaClip,
} from './index.test-support.ts';
import type { ProjectAssetEntry, ProjectExportEntry } from './contracts';
const projectsDbMocks = vi.hoisted(() => ({
  buildProjectAssetMediaEntryMock: vi.fn(),
  buildProjectExportMediaEntryMock: vi.fn(),
  buildRecordingMediaEntryMock: vi.fn(),
  createProjectAssetMediaIdMock: vi.fn(),
  createRecordingMediaIdMock: vi.fn(),
  dbGetAllFromIndexMock: vi.fn(),
  dbGetAllMock: vi.fn(),
  dbGetMock: vi.fn(),
  dbPutMock: vi.fn(),
  getRecordingMock: vi.fn(),
  initDBMock: vi.fn(),
  publishMediaHubLibraryChangedMock: vi.fn(),
  txDeleteMock: vi.fn(),
  txGetAllMock: vi.fn(),
  txGetMock: vi.fn(),
  txPutMock: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/core', () => ({
  MEDIA_LIBRARY_STORE: 'media_library',
  PROJECT_ASSETS_STORE: 'project_assets',
  PROJECT_EXPORTS_STORE: 'project_exports',
  VIDEO_PROJECTS_STORE: 'video_projects',
  initDB: projectsDbMocks.initDBMock,
}));

vi.mock('../media-library/entry-mapping', async (importOriginal) => ({
  ...(await importOriginal()),
  buildProjectAssetMediaEntry: projectsDbMocks.buildProjectAssetMediaEntryMock,
  buildProjectExportMediaEntry: projectsDbMocks.buildProjectExportMediaEntryMock,
  buildRecordingMediaEntry: projectsDbMocks.buildRecordingMediaEntryMock,
  createProjectAssetMediaId: projectsDbMocks.createProjectAssetMediaIdMock,
  createRecordingMediaId: projectsDbMocks.createRecordingMediaIdMock,
}));

vi.mock('../recordings/index', async (importOriginal) => ({
  ...(await importOriginal()),
  getRecording: projectsDbMocks.getRecordingMock,
}));

vi.mock('../../../features/media-hub/events', async (importOriginal) => ({
  ...(await importOriginal()),
  publishMediaHubLibraryChanged: projectsDbMocks.publishMediaHubLibraryChangedMock,
}));

function createDb() {
  return {
    get: projectsDbMocks.dbGetMock,
    getAll: projectsDbMocks.dbGetAllMock,
    getAllFromIndex: projectsDbMocks.dbGetAllFromIndexMock,
    put: projectsDbMocks.dbPutMock,
    transaction: vi.fn(() => ({
      done: Promise.resolve(),
      objectStore: vi.fn(() => ({
        delete: projectsDbMocks.txDeleteMock,
        get: projectsDbMocks.txGetMock,
        getAll: projectsDbMocks.txGetAllMock,
        put: projectsDbMocks.txPutMock,
      })),
    })),
  };
}

function resetProjectsDbMocks() {
  vi.clearAllMocks();
  projectsDbMocks.initDBMock.mockResolvedValue(createDb());
  projectsDbMocks.buildProjectAssetMediaEntryMock.mockImplementation(
    (entry: ProjectAssetEntry) => ({
      ...createMediaLibraryEntry(),
      id: `project-asset:${entry.id}`,
      mimeType: entry.mimeType,
    })
  );
  projectsDbMocks.buildProjectExportMediaEntryMock.mockImplementation(
    (entry: ProjectExportEntry) => ({
      ...createMediaLibraryEntry({
        filename: entry.filename,
        id: `export:${entry.id}`,
        kind: 'export',
        mimeType: entry.mimeType ?? 'video/webm',
        originalFilename: entry.filename,
        size: entry.size,
        source: {
          kind: 'project-export',
          exportId: entry.id,
          projectId: entry.projectId,
          recordingId: entry.recordingId,
        },
      }),
    })
  );
  projectsDbMocks.buildRecordingMediaEntryMock.mockImplementation((entry) =>
    createMediaLibraryEntry({
      filename: entry.filename,
      id: `recording:${entry.id}`,
      kind: 'recording',
      originalFilename: entry.filename,
      size: entry.size,
      source: { kind: 'recording', recordingId: entry.id },
    })
  );
  projectsDbMocks.createProjectAssetMediaIdMock.mockImplementation(
    (id: string) => `project-asset:${id}`
  );
  projectsDbMocks.createRecordingMediaIdMock.mockImplementation((id: string) => `recording:${id}`);
  projectsDbMocks.getRecordingMock.mockResolvedValue(undefined);
  projectsDbMocks.txGetAllMock.mockResolvedValue([]);
}

async function importProjectsDbModule() {
  vi.resetModules();
  return import('./index');
}

async function verifyProjectSaveRefreshesUpdatedAt() {
  const { saveVideoProject } = await importProjectsDbModule();
  const project = createVideoProject();
  projectsDbMocks.txGetMock.mockResolvedValue(createVideoProjectEntry({}, { createdAt: 55 }));
  vi.spyOn(Date, 'now').mockReturnValue(999);

  await saveVideoProject(project);

  expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith({
    createdAt: 55,
    id: 'project-1',
    project: expect.objectContaining({ id: 'project-1', updatedAt: 999 }),
    updatedAt: 999,
  });
  expect(projectsDbMocks.publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('update', [
    'video-project:project-1',
  ]);
}

async function verifyProjectReadListAndDelete() {
  const { deleteVideoProject, getVideoProject, listVideoProjects } = await importProjectsDbModule();
  projectsDbMocks.dbGetMock.mockResolvedValue(createVideoProjectEntry({ name: 'Loaded project' }));
  projectsDbMocks.dbGetAllMock.mockResolvedValue([
    createVideoProjectEntry({ createdAt: 10, duration: 20, name: 'Older', updatedAt: 10 }),
    createVideoProjectEntryWithMediaClip({
      createdAt: 30,
      duration: 40,
      id: 'project-2',
      name: 'Newer',
      updatedAt: 80,
      width: 1920,
      height: 1080,
    }),
  ]);

  await expect(getVideoProject('project-1')).resolves.toEqual(
    expect.objectContaining({
      project: expect.objectContaining({ id: 'project-1', name: 'Loaded project' }),
      status: 'ready',
    })
  );
  await expect(listVideoProjects()).resolves.toEqual([
    expect.objectContaining({ clipCount: 1, id: 'project-2', trackCount: 2 }),
    expect.objectContaining({ clipCount: 0, id: 'project-1', trackCount: 0 }),
  ]);

  await deleteVideoProject('project-1');
  expect(projectsDbMocks.txDeleteMock).toHaveBeenCalledWith('project-1');
}

describe('projects-db video project flows', () => {
  beforeEach(resetProjectsDbMocks);

  it(
    'saves projects with preserved createdAt and refreshed updatedAt',
    verifyProjectSaveRefreshesUpdatedAt
  );
  it('reads, lists and deletes video projects', verifyProjectReadListAndDelete);
});

describe('projects-db asset save and read flows', () => {
  beforeEach(resetProjectsDbMocks);

  it('saves and reads project assets while mirroring them into the media library', async () => {
    const { getProjectAsset, saveProjectAsset } = await importProjectsDbModule();
    const blob = new Blob(['asset'], { type: 'image/png' });
    projectsDbMocks.dbGetMock.mockResolvedValue(createProjectAssetEntry());
    vi.spyOn(Date, 'now').mockReturnValue(444);

    await saveProjectAsset('asset-1', blob, 'image/png', 'cover.png');

    expect(projectsDbMocks.txPutMock).toHaveBeenNthCalledWith(1, {
      blob,
      createdAt: 444,
      id: 'asset-1',
      mimeType: 'image/png',
      size: blob.size,
    });
    expect(projectsDbMocks.txPutMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        filename: 'cover.png',
        id: 'project-asset:asset-1',
        originalFilename: 'cover.png',
      })
    );
    await expect(getProjectAsset('asset-1')).resolves.toEqual(createProjectAssetEntry());
  });
});

describe('projects-db asset listing flows', () => {
  beforeEach(resetProjectsDbMocks);

  it('lists and deletes project assets using media-library filenames when available', async () => {
    const { deleteProjectAsset, listProjectAssets } = await importProjectsDbModule();
    projectsDbMocks.dbGetAllMock
      .mockResolvedValueOnce([
        createProjectAssetEntry({ id: 'asset-1' }),
        createProjectAssetEntry({ id: 'asset-2', mimeType: 'audio/mp3', size: 8 }),
      ])
      .mockResolvedValueOnce([
        createMediaLibraryEntry({ filename: 'from-library.png', id: 'project-asset:asset-1' }),
      ]);

    await expect(listProjectAssets()).resolves.toEqual([
      {
        createdAt: 200,
        filename: 'from-library.png',
        id: 'asset-1',
        mimeType: 'image/png',
        size: 12,
      },
      {
        createdAt: 200,
        filename: 'asset-2',
        id: 'asset-2',
        mimeType: 'audio/mp3',
        size: 8,
      },
    ]);

    await deleteProjectAsset('asset-1');

    expect(projectsDbMocks.txDeleteMock).toHaveBeenNthCalledWith(1, 'asset-1');
    expect(projectsDbMocks.txDeleteMock).toHaveBeenNthCalledWith(2, 'project-asset:asset-1');
  });
});

describe('projects-db export flows', () => {
  beforeEach(resetProjectsDbMocks);

  it('saves, reads, lists and deletes project exports while replacing recording media entries', async () => {
    const {
      deleteProjectExport,
      getProjectExport,
      listAllProjectExports,
      listProjectExports,
      saveProjectExport,
    } = await importProjectsDbModule();
    const exportEntry = createProjectExportEntry();
    projectsDbMocks.dbGetMock.mockResolvedValue(exportEntry);
    projectsDbMocks.dbGetAllFromIndexMock.mockResolvedValue([exportEntry]);
    projectsDbMocks.dbGetAllMock.mockResolvedValue([exportEntry]);

    await saveProjectExport(exportEntry);

    expect(projectsDbMocks.txPutMock).toHaveBeenNthCalledWith(1, exportEntry);
    expect(projectsDbMocks.txDeleteMock).toHaveBeenNthCalledWith(1, 'recording:recording-1');
    expect(projectsDbMocks.txPutMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ filename: 'export-1.webm', id: 'export:export-1' })
    );
    await expect(getProjectExport('export-1')).resolves.toEqual(exportEntry);
    await expect(listProjectExports('project-1')).resolves.toEqual([exportEntry]);
    await expect(listAllProjectExports()).resolves.toEqual([exportEntry]);

    projectsDbMocks.dbGetMock.mockResolvedValueOnce(exportEntry);
    projectsDbMocks.getRecordingMock.mockResolvedValueOnce({
      id: 'recording-1',
      filename: 'recording-1.webm',
      createdAt: 111,
      size: 99,
    });
    await deleteProjectExport('export-1');

    expect(projectsDbMocks.txDeleteMock).toHaveBeenNthCalledWith(2, 'export-1');
    expect(projectsDbMocks.txDeleteMock).toHaveBeenNthCalledWith(3, 'export:export-1');
    expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'recording:recording-1' })
    );
  });
});
