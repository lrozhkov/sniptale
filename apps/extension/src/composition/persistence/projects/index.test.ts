import { parseVideoProjectEntry } from './read-guards';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import { captureRootKey, pendingCheckpointKey } from '../sync-capture/contracts';
import { parseSyncCaptureRecord } from '../sync-capture/guards';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMediaLibraryEntry,
  resetProjectsDbMocks,
  projectFacadeAssetOverrides,
  projectFacadeEntryMapping,
  createAnnotationPublicationJournal,
  createAnnotationResourceInput,
  createAnnotationResourceClaim,
  createProjectAssetEntry,
  createProjectExportEntry,
  createVideoProject,
  createVideoProjectEntry,
  createVideoProjectEntryWithMediaClip,
} from './index.test-support.ts';
const projectsDbMocks = vi.hoisted(() => ({
  deleteUnreferenced: vi.fn(),
  selectedRecovery: vi.fn(),
  readyClaims: vi.fn(),
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
  releaseTransitionsMock: vi.fn(),
  readyJournalsMock: vi.fn(),
  cancelPublicationMock: vi.fn(),
  releaseReadyMock: vi.fn(),
}));

vi.mock('../assets/recovery', async (original) => ({
  ...(await original<typeof import('../assets/recovery')>()),
  recoverSelectedAssetPublications: projectsDbMocks.selectedRecovery,
}));

vi.mock('../assets/opfs-store', async (original) => ({
  ...(await original<typeof import('../assets/opfs-store')>()),
  releaseAssetPublicationTransitions: projectsDbMocks.releaseTransitionsMock,
  readAssetReadyPublicationClaims: projectsDbMocks.readyClaims,
}));

vi.mock('../media-library/delete-cascade', () => ({
  deleteUnreferencedMediaSource: projectsDbMocks.deleteUnreferenced,
}));

vi.mock('../assets', async (importOriginal) => ({
  ...(await importOriginal()),
  ...projectFacadeAssetOverrides(projectsDbMocks),
}));

vi.mock('./asset-publication', async (importOriginal) => ({
  ...(await importOriginal()),
  recoverProjectMediaPublications: projectsDbMocks.recoverProjectMediaPublicationsMock,
}));

vi.mock('../infrastructure/indexed-db/core', async (importOriginal) => ({
  ...(await importOriginal()),
  initDB: projectsDbMocks.initDBMock,
}));

vi.mock('../media-library/entry-mapping', async (importOriginal) => ({
  ...(await importOriginal()),
  ...projectFacadeEntryMapping(projectsDbMocks),
}));

vi.mock('../recordings/index', async (importOriginal) => ({
  ...(await importOriginal()),
  getRecording: projectsDbMocks.getRecordingMock,
}));

vi.mock('../../../features/media-hub/events', async (importOriginal) => ({
  ...(await importOriginal()),
  publishMediaHubLibraryChanged: projectsDbMocks.publishMediaHubLibraryChangedMock,
}));

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
    usageReferenceKeys: ['indexed:v2'],
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
    expect.objectContaining({ clipCount: 1, id: 'project-2', trackCount: 1 }),
    expect.objectContaining({ clipCount: 0, id: 'project-1', trackCount: 0 }),
  ]);

  await deleteVideoProject('project-1');
  expect(projectsDbMocks.txDeleteMock).toHaveBeenCalledWith('project-1');
}

function requireSavedRevision(entry: { workspaceRevision?: number }): number {
  if (entry.workspaceRevision === undefined) throw new Error('Saved workspace revision missing');
  return entry.workspaceRevision;
}

describe('projects-db video project flows', () => {
  beforeEach(() => resetProjectsDbMocks(projectsDbMocks));

  it(
    'saves projects with preserved createdAt and refreshed updatedAt',
    verifyProjectSaveRefreshesUpdatedAt
  );
  it('keeps a new project and its asset mirrors permanent despite a temporary request', async () => {
    const { saveVideoProject } = await importProjectsDbModule();
    const project = createVideoProjectEntryWithMediaClip().project;
    const media = createMediaLibraryEntry({
      id: 'project-asset:project-asset-1',
      lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 1 },
      source: { kind: 'project-asset', projectAssetId: 'project-asset-1' },
    });
    projectsDbMocks.txGetMock.mockImplementation(async (id: string) =>
      id === 'project-asset-1'
        ? createProjectAssetEntry({ id })
        : id === media.id
          ? media
          : undefined
    );
    vi.spyOn(Date, 'now').mockReturnValue(999);

    await saveVideoProject(project, { storageClass: 'temporary' });

    expect(projectsDbMocks.txPutMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: media.id,
        lifecycle: { savedAt: 999, storageClass: 'library', updatedAt: 999 },
      })
    );
  });
  it.each(['direct', 'private-origin', 'recording-origin'] as const)(
    'promotes the accepted logical source for %s insertion',
    async (path) => {
      const { saveVideoProject } = await importProjectsDbModule();
      const project = createVideoProjectEntryWithMediaClip().project;
      const media = createMediaLibraryEntry({
        id: 'logical-origin',
        ...(path === 'recording-origin'
          ? { source: { kind: 'recording' as const, recordingId: 'source-recording' } }
          : {}),
        lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 1 },
      });
      if (path === 'direct')
        project.assets[0]!.source = { kind: 'library-asset', mediaId: media.id };
      projectsDbMocks.txGetMock.mockImplementation(async (id: string) =>
        id === 'project-asset-1'
          ? createProjectAssetEntry({ id, originMediaId: media.id })
          : id === media.id
            ? media
            : id === 'source-recording'
              ? {
                  id,
                  assetId: 'recording-bytes',
                  createdAt: 1,
                  filename: 'source.webm',
                  size: 5,
                  mimeType: 'video/webm',
                  lifecycle: media.lifecycle,
                }
              : undefined
      );
      await saveVideoProject(project);
      expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: media.id,
          lifecycle: expect.objectContaining({ storageClass: 'library' }),
        })
      );
      if (path === 'recording-origin') {
        expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'source-recording',
            lifecycle: expect.objectContaining({ storageClass: 'library' }),
          })
        );
      }
    }
  );

  it('does not downgrade an independently promoted project asset on draft autosave', async () => {
    const { saveVideoProject } = await importProjectsDbModule();
    const project = createVideoProjectEntryWithMediaClip().project;
    const media = createMediaLibraryEntry({
      id: 'project-asset:project-asset-1',
      lifecycle: { savedAt: 800, storageClass: 'library', updatedAt: 800 },
      source: { kind: 'project-asset', projectAssetId: 'project-asset-1' },
    });
    projectsDbMocks.txGetMock.mockImplementation(async (id: string) =>
      id === 'project-asset-1'
        ? createProjectAssetEntry({ id })
        : id === media.id
          ? media
          : undefined
    );
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
  it('adds permanent lifecycle metadata when resaving a legacy project without it', async () => {
    const { saveVideoProject } = await importProjectsDbModule();
    const existing = createVideoProjectEntry();
    projectsDbMocks.txGetMock.mockResolvedValueOnce({ ...existing, lifecycle: undefined });
    vi.spyOn(Date, 'now').mockReturnValue(999);

    await saveVideoProject(existing.project, { storageClass: 'temporary' });

    expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lifecycle: {
          savedAt: existing.updatedAt,
          storageClass: 'library',
          updatedAt: 999,
        },
      })
    );
  });
  it('rejects an invalid project before starting a durable save', async () => {
    const { saveVideoProject } = await importProjectsDbModule();

    await expect(saveVideoProject({ ...createVideoProject(), duration: -1 })).rejects.toThrow(
      'Invalid video project payload'
    );

    expect(projectsDbMocks.txPutMock).not.toHaveBeenCalled();
  });
  it('fills a legacy project creation timestamp before saving it permanently', async () => {
    const { saveVideoProject } = await importProjectsDbModule();
    const { createdAt: _createdAt, ...legacyProject } = createVideoProject();
    projectsDbMocks.txGetMock.mockReset().mockResolvedValue(undefined);
    vi.spyOn(Date, 'now').mockReturnValue(999);

    await saveVideoProject(legacyProject as ReturnType<typeof createVideoProject>);

    expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        createdAt: 999,
        lifecycle: { savedAt: 999, storageClass: 'library', updatedAt: 999 },
      })
    );
  });
  it('reads, lists and deletes video projects', verifyProjectReadListAndDelete);
});

describe('projects-db asset save and read flows', () => {
  beforeEach(() => resetProjectsDbMocks(projectsDbMocks));

  it.each(['audio-mime', 'public', 'empty-review', 'clip-claim'] as const)(
    'rejects an invalid private resource before staging bytes: %s',
    async (invalid) => {
      const { prepareProjectAsset } = await importProjectsDbModule();
      await expect(
        prepareProjectAsset(
          new Blob(['logo']),
          invalid === 'audio-mime' ? 'audio/webm' : 'image/png',
          'logo.png',
          'logo',
          1,
          invalid === 'clip-claim' ? { aggregateId: 'review', clipId: 'audio' } : undefined,
          {
            publishToLibrary: invalid === 'public',
            requiredReviewResource: {
              aggregateId: invalid === 'empty-review' ? '' : 'review',
              slot: 'watermark',
            },
          }
        )
      ).rejects.toThrow('Invalid private review resource publication.');
      expect(projectsDbMocks.recoverProjectMediaPublicationsMock).not.toHaveBeenCalled();
      expect(projectsDbMocks.writeBlobToAssetMock).not.toHaveBeenCalled();
      expect(projectsDbMocks.createAssetPublicationJournalMock).not.toHaveBeenCalled();
    }
  );

  it('records a watermark recovery slot in the real prepared writer before attachment', async () => {
    const { prepareProjectAsset } = await importProjectsDbModule();
    const prepared = await prepareProjectAsset(
      new File(['logo'], 'logo.png', { type: 'image/png' }),
      'image/png',
      'logo.png',
      'logo',
      1,
      undefined,
      {
        publishToLibrary: false,
        originMediaId: 'source',
        requiredReviewResource: { aggregateId: 'review', slot: 'watermark' },
      }
    );
    await prepared.protect();
    expect(projectsDbMocks.createAssetPublicationJournalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          requiredReviewResource: { aggregateId: 'review', slot: 'watermark' },
          publishToLibrary: false,
          entry: expect.objectContaining({ originMediaId: 'source' }),
        }),
      })
    );
    expect(projectsDbMocks.publishReadyJournalWithRetryMock).not.toHaveBeenCalled();
  });

  it('records private acquisition origin and publication intent before placement', async () => {
    const { saveProjectAsset } = await importProjectsDbModule();
    await saveProjectAsset(
      'copy',
      new Blob(['asset'], { type: 'image/png' }),
      'image/png',
      'copy.png',
      444,
      { publishToLibrary: false, originMediaId: 'original' }
    );
    expect(projectsDbMocks.createAssetPublicationJournalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          expectedAssetId: null,
          entry: expect.objectContaining({ id: 'copy', originMediaId: 'original' }),
          filename: 'copy.png',
          publishToLibrary: false,
        },
      })
    );
  });

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
    projectsDbMocks.dbGetMock
      .mockResolvedValueOnce(entry)
      .mockResolvedValueOnce(entry)
      .mockResolvedValueOnce(ref);
    vi.spyOn(Date, 'now').mockReturnValue(444);

    await saveProjectAsset('asset-1', blob, 'image/png', 'cover.png');

    expect(projectsDbMocks.createAssetPublicationJournalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          expectedAssetId: entry.assetId,
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
  beforeEach(() => resetProjectsDbMocks(projectsDbMocks));

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

    projectsDbMocks.dbGetMock.mockResolvedValue(undefined);
    projectsDbMocks.txGetMock.mockImplementation(async (key: string) =>
      key === 'asset-1' ? createProjectAssetEntry({ id: 'asset-1' }) : undefined
    );
    projectsDbMocks.txGetAllMock.mockResolvedValue([]);
    await deleteProjectAsset('asset-1');

    expect(projectsDbMocks.txDeleteMock).toHaveBeenCalledWith('asset-1');
    expect(projectsDbMocks.txDeleteMock).toHaveBeenCalledWith('project-asset:asset-1');
  });

  it('does not delete a project asset while a retained publication journal cannot replay', async () => {
    const { deleteProjectAsset } = await importProjectsDbModule();
    projectsDbMocks.selectedRecovery.mockRejectedValueOnce(
      new Error('ready journal replay failed')
    );

    await expect(deleteProjectAsset('asset-1')).rejects.toThrow('ready journal replay failed');

    expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalled();
  });
});

describe('projects-db export flows', () => {
  beforeEach(() => resetProjectsDbMocks(projectsDbMocks));

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
    projectsDbMocks.dbGetMock
      .mockResolvedValueOnce(exportEntry)
      .mockResolvedValueOnce(exportEntry)
      .mockResolvedValueOnce(exportRef);
    projectsDbMocks.dbGetAllFromIndexMock.mockResolvedValue([exportEntry]);
    projectsDbMocks.dbGetAllMock.mockResolvedValue([exportEntry]);

    await saveProjectExport({ ...exportEntry, blob: exportBlob });

    expect(projectsDbMocks.createAssetPublicationJournalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          expectedAssetId: 'export-object-1',
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

    projectsDbMocks.dbGetMock.mockResolvedValueOnce(exportEntry);
    await deleteProjectExport('export-1');

    expect(projectsDbMocks.deleteUnreferenced).toHaveBeenCalledWith(
      {
        id: 'export:export-1',
        source: { kind: 'project-export', exportId: 'export-1', projectId: exportEntry.projectId },
      },
      { transitionPermit: expect.any(Object), lifecyclePermit: expect.any(Object) }
    );
    expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalledWith('recording:recording-1');
  });
});

describe('prepared scene resources', () => {
  beforeEach(() => resetProjectsDbMocks(projectsDbMocks));
  it('protects exact video slot claims and refuses Library binding through the upload writer', async () => {
    const { prepareProjectAsset } = await importProjectsDbModule();
    const claim = {
      aggregateId: 'review',
      slot: 'intro' as const,
      kind: 'video' as const,
      acquisition: 'private-upload' as const,
    };
    const prepared = await prepareProjectAsset(
      new Blob(['video']),
      'video/webm',
      'intro.webm',
      'intro',
      1,
      undefined,
      { publishToLibrary: false, requiredReviewResource: claim }
    );
    await prepared.protect();
    expect(projectsDbMocks.createAssetPublicationJournalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          requiredReviewResource: claim,
          publishToLibrary: false,
        }),
      })
    );
    projectsDbMocks.writeBlobToAssetMock.mockClear();
    for (const acquisition of ['library-binding', 'private-frozen-image'] as const) {
      await expect(
        prepareProjectAsset(
          new Blob(['video']),
          'video/webm',
          'intro.webm',
          'intro',
          1,
          undefined,
          { publishToLibrary: false, requiredReviewResource: { ...claim, acquisition } }
        )
      ).rejects.toThrow('Invalid private review resource');
    }
    expect(projectsDbMocks.writeBlobToAssetMock).not.toHaveBeenCalled();
  });
});

describe('prepared annotation resources', () => {
  beforeEach(() => resetProjectsDbMocks(projectsDbMocks));
  const claim = createAnnotationResourceClaim();

  it('reads its retained private physical ref without publishing and rejects reads outside that lease', async () => {
    const { prepareProjectAsset } = await importProjectsDbModule();
    const prepared = await prepareProjectAsset(...createAnnotationResourceInput(claim));
    const signal = new AbortController().signal;
    await expect(prepared.readForSession!(signal)).rejects.toThrow('retention is unavailable');
    expect(projectsDbMocks.readAssetFileMock).not.toHaveBeenCalled();
    const release = await prepared.retainForSession();
    const blob = new File(['image'], 'mark.png', { type: 'image/png' });
    projectsDbMocks.readAssetFileMock.mockResolvedValueOnce(blob);
    expect(await prepared.readForSession!(signal)).toBe(blob);
    expect(projectsDbMocks.readAssetFileMock).toHaveBeenCalledExactlyOnceWith(prepared.ref, 'mark');
    expect(projectsDbMocks.publishReadyJournalWithRetryMock).not.toHaveBeenCalled();
    expect(projectsDbMocks.dbPutMock).not.toHaveBeenCalled();
    await release();
    await expect(prepared.readForSession!(signal)).rejects.toThrow('retention is unavailable');
  });

  it.each(['abort', 'missing', 'release', 'publish'] as const)(
    'cannot return stale private bytes after %s during a physical read',
    async (outcome) => {
      const { prepareProjectAsset } = await importProjectsDbModule();
      const prepared = await prepareProjectAsset(...createAnnotationResourceInput(claim));
      const release = await prepared.retainForSession();
      const controller = new AbortController();
      projectsDbMocks.readAssetFileMock.mockImplementationOnce(async () => {
        if (outcome === 'missing') throw new Error('PRIVATE_PHYSICAL_ID');
        if (outcome === 'abort') controller.abort();
        if (outcome === 'release') await release();
        if (outcome === 'publish') await prepared.publish();
        return new File(['image'], 'mark.png', { type: 'image/png' });
      });
      const read = prepared.readForSession!(controller.signal);
      if (outcome === 'abort') await expect(read).rejects.toMatchObject({ name: 'AbortError' });
      else
        await expect(read).rejects.toThrow(
          outcome === 'missing' ? 'bytes are unavailable' : 'retention is unavailable'
        );
      await release();
    }
  );

  it.each([false, true])(
    'terminal cancellation does not recreate an erased journal, retained=%s',
    async (retained) => {
      const { prepareProjectAsset } = await importProjectsDbModule();
      const prepared = await prepareProjectAsset(...createAnnotationResourceInput(claim));
      const release = await prepared.retainForSession();
      const journal = createAnnotationPublicationJournal(prepared.ref, claim);
      projectsDbMocks.readyJournalsMock.mockResolvedValue(retained ? [journal] : []);
      try {
        await prepared.cancel();
        await prepared.cancel();
        await prepared.publish();
        expect(projectsDbMocks.cancelPublicationMock).toHaveBeenCalledTimes(retained ? 1 : 0);
        if (retained)
          expect(projectsDbMocks.cancelPublicationMock).toHaveBeenCalledWith(
            journal,
            expect.anything()
          );
        else
          expect(projectsDbMocks.releaseReadyMock).toHaveBeenCalledExactlyOnceWith([
            'asset-object-1',
          ]);
        expect(projectsDbMocks.publishReadyJournalWithRetryMock).not.toHaveBeenCalled();
        expect(projectsDbMocks.dbPutMock).not.toHaveBeenCalled();
      } finally {
        await release();
      }
    }
  );

  it('protects before releasing the global gate and defers recovery until session release', async () => {
    const { prepareProjectAsset } = await importProjectsDbModule();
    const { tryVoiceoverAttachmentLock } = await import('./voiceover-publication-lock');
    const prepared = await prepareProjectAsset(...createAnnotationResourceInput(claim));
    const release = await prepared.retainForSession();
    try {
      expect(projectsDbMocks.createAssetPublicationJournalMock).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            expectedAssetId: null,
            publishToLibrary: false,
            requiredReviewAnnotationEffect: claim,
          }),
        })
      );
      expect(projectsDbMocks.releaseTransitionsMock).toHaveBeenCalledExactlyOnceWith([
        'asset-object-1',
      ]);
      expect(
        projectsDbMocks.createAssetPublicationJournalMock.mock.invocationCallOrder[0]
      ).toBeLessThan(projectsDbMocks.releaseTransitionsMock.mock.invocationCallOrder[0]!);
      expect(await tryVoiceoverAttachmentLock('project-asset:mark', async () => 'recovery')).toBe(
        'defer'
      );
      expect(projectsDbMocks.publishReadyJournalWithRetryMock).not.toHaveBeenCalled();
      expect(projectsDbMocks.dbPutMock).not.toHaveBeenCalled();
      expect(await prepared.retainForSession()).toBe(release);
    } finally {
      await release();
    }
    expect(await tryVoiceoverAttachmentLock('project-asset:mark', async () => 'recovery')).toBe(
      'recovery'
    );
    await release();
  });

  it('releases an acquired attachment lease after failed protection and permits explicit retry', async () => {
    const { prepareProjectAsset } = await importProjectsDbModule();
    const { tryVoiceoverAttachmentLock } = await import('./voiceover-publication-lock');
    const prepared = await prepareProjectAsset(...createAnnotationResourceInput(claim));
    projectsDbMocks.createAssetPublicationJournalMock.mockRejectedValueOnce(
      new Error('journal failed')
    );
    await expect(prepared.retainForSession()).rejects.toThrow('journal failed');
    expect(projectsDbMocks.releaseTransitionsMock).not.toHaveBeenCalled();
    expect(await tryVoiceoverAttachmentLock('project-asset:mark', async () => 'recovery')).toBe(
      'recovery'
    );
    const release = await prepared.retainForSession();
    await release();
  });

  it('rejects public/mixed claims and immutable identity collision before staging', async () => {
    const { prepareProjectAsset } = await importProjectsDbModule();
    for (const options of [
      { publishToLibrary: true, requiredReviewAnnotationEffect: claim },
      { publishToLibrary: false, requiredReviewAnnotationEffect: claim, originMediaId: 'library' },
      {
        publishToLibrary: false,
        requiredReviewAnnotationEffect: claim,
        requiredReviewResource: { aggregateId: 'review', slot: 'watermark' as const },
      },
    ])
      await expect(
        prepareProjectAsset(
          new Blob(['image']),
          'image/png',
          'mark.png',
          'mark',
          1,
          undefined,
          options
        )
      ).rejects.toThrow('Invalid private annotation');
    projectsDbMocks.dbGetMock.mockResolvedValueOnce(createProjectAssetEntry({ id: 'mark' }));
    await expect(
      prepareProjectAsset(new Blob(['image']), 'image/png', 'mark.png', 'mark', 1, undefined, {
        publishToLibrary: false,
        requiredReviewAnnotationEffect: claim,
      })
    ).rejects.toThrow('new immutable identity');
    expect(projectsDbMocks.writeBlobToAssetMock).not.toHaveBeenCalled();
  });
});

describe('Montage native checkpoint ACK receipts', () => {
  beforeEach(() => resetProjectsDbMocks(projectsDbMocks));
  function nativeFixture() {
    let refuseCapture = false;
    const fixture = createReviewWorkspaceStoreFixture(
      (name) => name === 'sync_capture' && refuseCapture
    );
    projectsDbMocks.initDBMock.mockResolvedValue(fixture.database);
    fixture.rows.get('sync_capture')!.set('profile', {
      version: 1,
      kind: 'profile',
      key: 'profile',
      createdAt: 1,
      enabled: true,
      spaceId: 'receipt-space',
      connectionGeneration: 1,
      checkpointIntervalMs: 300000,
    });
    return {
      ...fixture,
      refuse: (value: boolean) => {
        refuseCapture = value;
      },
    };
  }

  it('issues distinct exact pending receipts without persisting ACK metadata', async () => {
    const { saveVideoProject } = await importProjectsDbModule();
    const fixture = nativeFixture();
    const first = await saveVideoProject(
      createVideoProject({ id: 'receipt-project', name: 'First edit' }),
      { expectedWorkspaceRevision: null }
    );
    const key = pendingCheckpointKey(captureRootKey('receipt-space', 'video-project', first.id));
    const firstPending = parseSyncCaptureRecord(fixture.rows.get('sync_capture')!.get(key));
    if (firstPending?.kind !== 'pending-checkpoint')
      throw new Error('Expected native pending work');
    expect(first.checkpointReceipt).toEqual({
      rootKind: 'video-project',
      rootId: first.id,
      revision: firstPending.revision,
    });
    const second = await saveVideoProject(
      { ...first.project, name: 'Second edit' },
      { expectedWorkspaceRevision: requireSavedRevision(first), expectedProject: first.project }
    );
    const secondPending = parseSyncCaptureRecord(fixture.rows.get('sync_capture')!.get(key));
    if (secondPending?.kind !== 'pending-checkpoint')
      throw new Error('Expected replacement pending work');
    expect(second.checkpointReceipt).toEqual({
      rootKind: 'video-project',
      rootId: first.id,
      revision: secondPending.revision,
    });
    expect(second.checkpointReceipt?.revision).not.toBe(first.checkpointReceipt?.revision);
    const stored = fixture.rows.get('video_projects')!.get(first.id);
    expect(stored).not.toHaveProperty('checkpointReceipt');
    expect(second.project).not.toHaveProperty('checkpointReceipt');
    const { checkpointReceipt: _receipt, ...entry } = second;
    expect(parseVideoProjectEntry(stored)).toEqual(entry);
    expect(firstPending.dueAt).toBe(secondPending.dueAt);
    const { getVideoProject } = await import('./index');
    const read = await getVideoProject(first.id);
    expect(read).toMatchObject({ status: 'ready', project: second.project });
    expect(read).not.toHaveProperty('checkpointReceipt');
  });

  it('exposes the pending receipt only after transaction completion', async () => {
    const { saveVideoProject } = await importProjectsDbModule();
    const fixture = nativeFixture();
    let entered!: () => void;
    let finish!: () => void;
    const reached = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const completion = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const original = fixture.database.transaction.bind(fixture.database);
    vi.spyOn(fixture.database, 'transaction').mockImplementation((stores, mode) => {
      const tx = original(stores, mode);
      if (mode !== 'readwrite') return tx;
      return {
        objectStore: tx.objectStore.bind(tx),
        abort: tx.abort.bind(tx),
        get done() {
          entered();
          return completion.then(() => tx.done);
        },
      };
    });
    let acknowledged = false;
    const saving = saveVideoProject(createVideoProject({ id: 'receipt-project' }), {
      expectedWorkspaceRevision: null,
    });
    void saving.then(() => {
      acknowledged = true;
    });
    await reached;
    expect(acknowledged).toBe(false);
    finish();
    const saved = await saving;
    expect(saved.checkpointReceipt).toBeDefined();
    const key = pendingCheckpointKey(captureRootKey('receipt-space', 'video-project', saved.id));
    const pending = parseSyncCaptureRecord(fixture.rows.get('sync_capture')!.get(key));
    if (pending?.kind !== 'pending-checkpoint') throw new Error('Expected committed pending work');
    expect(saved.checkpointReceipt?.revision).toBe(pending.revision);
  });

  it('refuses stale and aborted saves without issuing or consuming a receipt', async () => {
    const { saveVideoProject } = await importProjectsDbModule();
    const fixture = nativeFixture();
    const first = await saveVideoProject(createVideoProject({ id: 'receipt-project' }), {
      expectedWorkspaceRevision: null,
    });
    const committed = structuredClone(fixture.rows);
    await expect(
      saveVideoProject(
        { ...first.project, name: 'Stale edit' },
        { expectedWorkspaceRevision: 0, expectedProject: first.project }
      )
    ).rejects.toMatchObject({ name: 'StaleVideoProjectSaveError' });
    expect(fixture.rows).toEqual(committed);
    fixture.refuse(true);
    await expect(
      saveVideoProject(
        { ...first.project, name: 'Refused edit' },
        { expectedWorkspaceRevision: requireSavedRevision(first), expectedProject: first.project }
      )
    ).rejects.toMatchObject({ name: 'QuotaExceededError' });
    expect(fixture.rows).toEqual(committed);
    fixture.refuse(false);
    const retried = await saveVideoProject(
      { ...first.project, name: 'Refused edit' },
      { expectedWorkspaceRevision: requireSavedRevision(first), expectedProject: first.project }
    );
    expect(retried.checkpointReceipt).toBeDefined();
    expect(first.checkpointReceipt).toBeDefined();
    expect(retried.checkpointReceipt?.revision).not.toBe(first.checkpointReceipt?.revision);
    expect(retried.project.name).toBe('Refused edit');
  });

  it.each(['unconfigured', 'immediate'] as const)(
    'issues a due receipt only when immediate native work is configured: %s',
    async (mode) => {
      const { saveVideoProject } = await importProjectsDbModule();
      const fixture = nativeFixture();
      if (mode === 'unconfigured') fixture.rows.get('sync_capture')!.delete('profile');
      else
        fixture.rows.get('sync_capture')!.set('profile', {
          version: 1,
          kind: 'profile',
          key: 'profile',
          createdAt: 1,
          enabled: true,
          spaceId: 'receipt-space',
          connectionGeneration: 1,
          checkpointIntervalMs: 0,
        });
      const result = await saveVideoProject(createVideoProject({ id: 'receipt-project' }), {
        expectedWorkspaceRevision: null,
      });
      const { checkpointReceipt, ...nativeResult } = result;
      const stored = fixture.rows.get('video_projects')!.get(result.id);
      expect(stored).not.toHaveProperty('checkpointReceipt');
      expect(parseVideoProjectEntry(stored)).toEqual(nativeResult);
      const pending = [...fixture.rows.get('sync_capture')!.values()]
        .map(parseSyncCaptureRecord)
        .filter((row) => row?.kind === 'pending-checkpoint');
      if (mode === 'immediate') {
        expect(checkpointReceipt).toBeDefined();
        expect(pending).toHaveLength(1);
        expect(pending[0]?.revision).toBe(checkpointReceipt?.revision);
        expect(pending[0]?.dueAt).toBe(pending[0]?.createdAt);
      } else {
        expect(checkpointReceipt).toBeUndefined();
        expect(pending).toHaveLength(0);
      }
    }
  );
});
