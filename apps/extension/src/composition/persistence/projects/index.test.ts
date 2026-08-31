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
  assertAssetWriteAdmissionMock: vi.fn(),
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
  createAssetPublicationJournalMock: vi.fn(),
  completePhysicalDeleteOperationMock: vi.fn(),
  publishReadyJournalWithRetryMock: vi.fn(),
  readAssetFileMock: vi.fn(),
  recoverProjectMediaPublicationsMock: vi.fn(),
  writeBlobToAssetMock: vi.fn(),
}));

vi.mock('../assets', async (importOriginal) => ({
  ...(await importOriginal()),
  assertAssetWriteAdmission: projectsDbMocks.assertAssetWriteAdmissionMock,
  createAssetPublicationJournal: projectsDbMocks.createAssetPublicationJournalMock,
  completePhysicalDeleteOperation: projectsDbMocks.completePhysicalDeleteOperationMock,
  publishReadyJournalWithRetry: projectsDbMocks.publishReadyJournalWithRetryMock,
  readAssetFile: projectsDbMocks.readAssetFileMock,
  releaseAssetReadyProtection: vi.fn(),
  writeBlobToAsset: projectsDbMocks.writeBlobToAssetMock,
}));

vi.mock('./asset-publication', async (importOriginal) => ({
  ...(await importOriginal()),
  recoverProjectMediaPublications: projectsDbMocks.recoverProjectMediaPublicationsMock,
}));

vi.mock('../infrastructure/indexed-db/core', async (importOriginal) => ({
  ...(await importOriginal()),
  AGGREGATE_PRESENTATIONS_STORE: 'aggregate_presentations',
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
        index: vi.fn(() => ({ count: vi.fn().mockResolvedValue(0) })),
        put: projectsDbMocks.txPutMock,
      })),
    })),
  };
}

function resetProjectsDbMocks() {
  vi.clearAllMocks();
  projectsDbMocks.initDBMock.mockResolvedValue(createDb());
  projectsDbMocks.assertAssetWriteAdmissionMock.mockResolvedValue(undefined);
  projectsDbMocks.recoverProjectMediaPublicationsMock.mockResolvedValue(undefined);
  projectsDbMocks.writeBlobToAssetMock.mockImplementation(async (blob: Blob) => ({
    ref: {
      assetId: 'asset-object-1',
      createdAt: 1,
      location: { kind: 'opfs', objectKey: 'objects/asset-object-1' },
      mimeType: blob.type || 'application/octet-stream',
      sha256: null,
      size: blob.size,
    },
  }));
  projectsDbMocks.createAssetPublicationJournalMock.mockResolvedValue({ journalId: 'journal-1' });
  projectsDbMocks.completePhysicalDeleteOperationMock.mockResolvedValue(undefined);
  projectsDbMocks.publishReadyJournalWithRetryMock.mockResolvedValue(undefined);
  projectsDbMocks.readAssetFileMock.mockResolvedValue(
    new File(['asset'], 'asset.bin', { type: 'application/octet-stream' })
  );
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
    lifecycle: {
      savedAt: 100,
      storageClass: 'library',
      updatedAt: 999,
    },
    project: expect.objectContaining({ id: 'project-1', updatedAt: 999 }),
    updatedAt: 999,
    workspaceRevision: 1,
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
  it('aligns project-asset mirrors with a new temporary project lifecycle', async () => {
    const { saveVideoProject } = await importProjectsDbModule();
    const project = createVideoProjectEntryWithMediaClip().project;
    const media = createMediaLibraryEntry({
      id: 'project-asset:project-asset-1',
      lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 1 },
      source: { kind: 'project-asset', projectAssetId: 'project-asset-1' },
    });
    projectsDbMocks.txGetMock.mockResolvedValueOnce(undefined).mockResolvedValueOnce(media);
    vi.spyOn(Date, 'now').mockReturnValue(999);

    await saveVideoProject(project, { storageClass: 'temporary' });

    expect(projectsDbMocks.txPutMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: media.id,
        lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 999 },
      })
    );
  });
  it('does not downgrade an independently promoted project asset on draft autosave', async () => {
    const { saveVideoProject } = await importProjectsDbModule();
    const project = createVideoProjectEntryWithMediaClip().project;
    const media = createMediaLibraryEntry({
      id: 'project-asset:project-asset-1',
      lifecycle: { savedAt: 800, storageClass: 'library', updatedAt: 800 },
      source: { kind: 'project-asset', projectAssetId: 'project-asset-1' },
    });
    projectsDbMocks.txGetMock.mockResolvedValueOnce(undefined).mockResolvedValueOnce(media);
    vi.spyOn(Date, 'now').mockReturnValue(999);

    await saveVideoProject(project, { storageClass: 'temporary' });

    expect(projectsDbMocks.txPutMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: media.id,
        lifecycle: { savedAt: 800, storageClass: 'library', updatedAt: 800 },
      })
    );
  });
  it('reads, lists and deletes video projects', verifyProjectReadListAndDelete);
});

describe('projects-db asset save and read flows', () => {
  beforeEach(resetProjectsDbMocks);

  it('saves and reads project assets while mirroring them into the media library', async () => {
    const { getProjectAsset, saveProjectAsset } = await importProjectsDbModule();
    const blob = new Blob(['asset'], { type: 'image/png' });
    const entry = createProjectAssetEntry();
    const ref = {
      assetId: entry.assetId,
      createdAt: 1,
      location: { kind: 'opfs', objectKey: `objects/${entry.assetId}` },
      mimeType: entry.mimeType,
      sha256: null,
      size: entry.size,
    };
    projectsDbMocks.dbGetMock.mockResolvedValueOnce(entry).mockResolvedValueOnce(ref);
    vi.spyOn(Date, 'now').mockReturnValue(444);

    await saveProjectAsset('asset-1', blob, 'image/png', 'cover.png');

    expect(projectsDbMocks.createAssetPublicationJournalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          entry: expect.objectContaining({
            assetId: 'asset-object-1',
            createdAt: 444,
            id: 'asset-1',
          }),
          filename: 'cover.png',
        },
      })
    );
    await expect(getProjectAsset('asset-1')).resolves.toEqual({
      entry: {
        ...entry,
        file: expect.any(File),
      },
      status: 'ready',
    });
  });

  it('distinguishes logical absence, invalid references, and unavailable asset files', async () => {
    const { getProjectAsset } = await importProjectsDbModule();
    const entry = createProjectAssetEntry();

    projectsDbMocks.dbGetMock.mockResolvedValueOnce(undefined);
    await expect(getProjectAsset('missing')).resolves.toEqual({ status: 'not-found' });

    projectsDbMocks.dbGetMock.mockResolvedValueOnce(entry).mockResolvedValueOnce(undefined);
    await expect(getProjectAsset('invalid-ref')).resolves.toEqual({
      reason: 'invalid-asset-reference',
      status: 'invalid',
    });

    projectsDbMocks.dbGetMock.mockResolvedValueOnce(entry).mockResolvedValueOnce({
      assetId: entry.assetId,
      createdAt: 1,
      location: { kind: 'opfs', objectKey: `objects/${entry.assetId}` },
      mimeType: entry.mimeType,
      sha256: null,
      size: entry.size,
    });
    projectsDbMocks.readAssetFileMock.mockRejectedValueOnce(new Error('OPFS unavailable'));
    await expect(getProjectAsset('unavailable-file')).resolves.toEqual({
      reason: 'asset-file-unavailable',
      status: 'unavailable',
    });
  });

  it('reports IndexedDB failures as unavailable instead of logical absence', async () => {
    const { getProjectAsset } = await importProjectsDbModule();
    projectsDbMocks.dbGetMock.mockRejectedValueOnce(new Error('IndexedDB unavailable'));

    await expect(getProjectAsset('asset-1')).resolves.toEqual({
      reason: 'asset-entry-unavailable',
      status: 'unavailable',
    });
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
        assetId: 'asset-object-1',
        createdAt: 200,
        filename: 'from-library.png',
        id: 'asset-1',
        mimeType: 'image/png',
        size: 12,
      },
      {
        assetId: 'asset-object-1',
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

  it('does not delete a project asset while a retained publication journal cannot replay', async () => {
    const { deleteProjectAsset } = await importProjectsDbModule();
    projectsDbMocks.recoverProjectMediaPublicationsMock.mockRejectedValueOnce(
      new Error('ready journal replay failed')
    );

    await expect(deleteProjectAsset('asset-1')).rejects.toThrow('ready journal replay failed');

    expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalled();
  });
});

describe('projects-db export flows', () => {
  beforeEach(resetProjectsDbMocks);

  it('saves, reads, lists and deletes direct project export assets', async () => {
    const {
      deleteProjectExport,
      getProjectExport,
      listAllProjectExports,
      listProjectExports,
      saveProjectExport,
    } = await importProjectsDbModule();
    const exportEntry = createProjectExportEntry();
    const exportBlob = new Blob(['export'], { type: 'video/mp4' });
    const exportRef = {
      assetId: exportEntry.assetId,
      createdAt: 1,
      location: { kind: 'opfs', objectKey: `objects/${exportEntry.assetId}` },
      mimeType: exportEntry.mimeType,
      sha256: null,
      size: exportEntry.size,
    };
    projectsDbMocks.dbGetMock.mockResolvedValueOnce(exportEntry).mockResolvedValueOnce(exportRef);
    projectsDbMocks.dbGetAllFromIndexMock.mockResolvedValue([exportEntry]);
    projectsDbMocks.dbGetAllMock.mockResolvedValue([exportEntry]);

    await saveProjectExport({ ...exportEntry, blob: exportBlob });

    expect(projectsDbMocks.createAssetPublicationJournalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          entry: expect.objectContaining({
            assetId: 'asset-object-1',
            id: 'export-1',
            projectId: 'project-1',
          }),
        },
      })
    );
    await expect(getProjectExport('export-1')).resolves.toEqual({
      ...exportEntry,
      file: expect.any(File),
    });
    await expect(listProjectExports('project-1')).resolves.toEqual([exportEntry]);
    await expect(listAllProjectExports()).resolves.toEqual([exportEntry]);

    projectsDbMocks.txGetMock.mockResolvedValueOnce(exportEntry);
    await deleteProjectExport('export-1');

    expect(projectsDbMocks.txDeleteMock).toHaveBeenCalledWith('export-1');
    expect(projectsDbMocks.txDeleteMock).toHaveBeenCalledWith('export:export-1');
    expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalledWith('recording:recording-1');
  });
});
