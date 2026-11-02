import { vi, type Mock } from 'vitest';
import { createMediaLibraryEntry } from './index.storage.test-support';
import type { ProjectAssetEntry, ProjectExportEntry } from './contracts';
import type { AssetRef, AssetReadyJournal } from '../assets/contracts';
import type { ProjectAssetPublicationOptions } from './asset-publication-payload';
import { projectRowReferenceKeys } from '../assets/retention-index-projection';
import { ROW_REFERENCE_INDEX } from '../infrastructure/indexed-db/row-index-contract';
import {
  VideoTimelinePlacementMode,
  VideoProjectSourceKind,
  VideoProjectAssetType,
  type VideoProject,
} from '../../../features/video/project/types/index';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../features/video/project/factories/clip';
import type { VideoProjectEntry } from './contracts';

export {
  createMediaLibraryEntry,
  createProjectAssetEntry,
  createProjectExportEntry,
} from './index.storage.test-support';

export function createVideoProject(overrides: Partial<VideoProject> = {}): VideoProject {
  return {
    actionEvents: [],
    assets: [],
    backgroundColor: '#000000',
    baseRecordingId: null,
    clips: [],
    createdAt: 100,
    cursorTrack: null,
    duration: 30,
    fps: 30,
    height: 720,
    id: 'project-1',
    name: 'Demo project',
    source: {
      kind: VideoProjectSourceKind.MANUAL,
    },
    timelinePlacementMode: VideoTimelinePlacementMode.RIPPLE_PUSH,
    tracks: [],
    updatedAt: 100,
    version: 2,
    width: 1280,
    ...overrides,
  };
}

export function createVideoProjectEntry(
  projectOverrides: Partial<VideoProject> = {},
  overrides: Partial<VideoProjectEntry> = {}
): VideoProjectEntry {
  const project = createVideoProject(projectOverrides);
  return {
    createdAt: project.createdAt,
    id: project.id,
    project,
    updatedAt: project.updatedAt,
    workspaceRevision: 0,
    ...overrides,
  };
}

export function createVideoProjectEntryWithMediaClip(
  projectOverrides: Partial<VideoProject> = {}
): VideoProjectEntry {
  const project = createEmptyVideoProject(
    projectOverrides.name ?? 'Newer',
    projectOverrides.width ?? 1920,
    projectOverrides.height ?? 1080
  );
  const asset = createVideoProjectAsset(
    'Clip asset',
    VideoProjectAssetType.VIDEO,
    { kind: 'project-asset', projectAssetId: 'project-asset-1' },
    {
      audioPeaks: null,
      duration: 10,
      hasAudio: true,
      height: project.height,
      mimeType: 'video/webm',
      size: 1024,
      width: project.width,
    }
  );
  const clip = createVideoClipFromAsset(
    project.tracks[0]!.id,
    asset,
    project.width,
    project.height
  );

  return createVideoProjectEntry({
    ...project,
    ...projectOverrides,
    assets: [asset],
    clips: [clip],
    tracks: project.tracks.slice(0, 2),
  });
}

/** Bind archive participant stores to the caller-owned transaction in owner-direct proofs. */
export function createVideoProjectRestoreTransaction(
  stores: import('./backup-restore').VideoProjectBackupRestoreStores
) {
  const empty = {
    get: async () => undefined,
    getAll: async () => [],
    index: () => ({ getAll: async () => [], getAllKeys: async () => [] }),
    delete: async () => undefined,
    put: async () => undefined,
  };
  const byName = {
    sync_capture: empty,
    project_export_inputs: empty,
    video_project_revisions: empty,
    project_assets: stores.assets,
    project_exports: stores.exports,
    media_library: stores.media,
    video_workspaces: stores.videoWorkspaces,
    video_workspace_history: empty,
    video_workspace_drafts: stores.videoDrafts,
    asset_operations: stores.operations,
    asset_owners: stores.owners,
    aggregate_presentations: stores.presentations,
    video_projects: stores.projects,
    asset_refs: stores.refs,
    thumbnails: stores.thumbnails,
    scenario_assets: stores.scenarioAssets,
    image_workspaces: empty,
    recordings: empty,
  };
  return {
    objectStore: (name: keyof typeof byName) => {
      const source = byName[name];
      return {
        ...source,
        index: (index: string) =>
          index === ROW_REFERENCE_INDEX
            ? {
                getAll: async (key: IDBValidKey) => {
                  const rows: unknown[] = await source.getAll();
                  return rows.filter((row) =>
                    projectRowReferenceKeys(name, row).includes(String(key))
                  );
                },
              }
            : (() => {
                const nativeIndex: unknown = Reflect.get(source, 'index');
                if (typeof nativeIndex !== 'function') throw new Error('Missing fixture index');
                return Reflect.apply(nativeIndex, source, [index]);
              })(),
      };
    },
  } as unknown as import('idb').IDBPTransaction<unknown, string[], 'readwrite'>;
}

type ProjectFacadeMocks = {
  deleteUnreferenced: Mock;
  selectedRecovery: Mock;
  readyClaims: Mock;
  assertAssetWriteAdmissionMock: Mock;
  buildProjectAssetMediaEntryMock: Mock;
  buildProjectExportMediaEntryMock: Mock;
  buildRecordingMediaEntryMock: Mock;
  createProjectAssetMediaIdMock: Mock;
  createRecordingMediaIdMock: Mock;
  dbGetAllFromIndexMock: Mock;
  dbGetAllMock: Mock;
  dbGetMock: Mock;
  dbPutMock: Mock;
  getRecordingMock: Mock;
  initDBMock: Mock;
  publishMediaHubLibraryChangedMock: Mock;
  txDeleteMock: Mock;
  txGetAllMock: Mock;
  txGetMock: Mock;
  txPutMock: Mock;
  createAssetPublicationJournalMock: Mock;
  completePhysicalDeleteOperationMock: Mock;
  publishReadyJournalWithRetryMock: Mock;
  readAssetFileMock: Mock;
  recoverProjectMediaPublicationsMock: Mock;
  writeBlobToAssetMock: Mock;
  releaseTransitionsMock: Mock;
  readyJournalsMock: Mock;
  cancelPublicationMock: Mock;
  releaseReadyMock: Mock;
};

export function projectFacadeAssetOverrides(projectsDbMocks: ProjectFacadeMocks) {
  return {
    assertAssetWriteAdmission: projectsDbMocks.assertAssetWriteAdmissionMock,
    createAssetPublicationJournal: projectsDbMocks.createAssetPublicationJournalMock,
    completePhysicalDeleteOperation: projectsDbMocks.completePhysicalDeleteOperationMock,
    publishReadyJournalWithRetry: projectsDbMocks.publishReadyJournalWithRetryMock,
    readAssetFile: projectsDbMocks.readAssetFileMock,
    releaseAssetReadyProtection: projectsDbMocks.releaseReadyMock,
    listReadyJournals: projectsDbMocks.readyJournalsMock,
    cancelAssetPublication: projectsDbMocks.cancelPublicationMock,
    writeBlobToAsset: projectsDbMocks.writeBlobToAssetMock,
  };
}

export function projectFacadeEntryMapping(projectsDbMocks: ProjectFacadeMocks) {
  return {
    buildProjectAssetMediaEntry: projectsDbMocks.buildProjectAssetMediaEntryMock,
    buildProjectExportMediaEntry: projectsDbMocks.buildProjectExportMediaEntryMock,
    buildRecordingMediaEntry: projectsDbMocks.buildRecordingMediaEntryMock,
    createProjectAssetMediaId: projectsDbMocks.createProjectAssetMediaIdMock,
    createRecordingMediaId: projectsDbMocks.createRecordingMediaIdMock,
  };
}

function createDb(projectsDbMocks: ProjectFacadeMocks) {
  return {
    get: projectsDbMocks.dbGetMock,
    getAll: projectsDbMocks.dbGetAllMock,
    getAllFromIndex: projectsDbMocks.dbGetAllFromIndexMock,
    put: projectsDbMocks.dbPutMock,
    transaction: vi.fn(() => ({
      done: Promise.resolve(),
      objectStore: vi.fn((name: string) =>
        name === 'sync_capture' || name === 'video_project_revisions'
          ? { get: async () => undefined, put: async () => undefined }
          : {
              delete: projectsDbMocks.txDeleteMock,
              get: projectsDbMocks.txGetMock,
              getAll: projectsDbMocks.txGetAllMock,
              index: vi.fn(() => ({
                count: vi.fn().mockResolvedValue(0),
                getAll: async () => [],
                getAllKeys: async () => [],
              })),
              put: projectsDbMocks.txPutMock,
            }
      ),
    })),
  };
}

export function resetProjectsDbMocks(projectsDbMocks: ProjectFacadeMocks) {
  vi.clearAllMocks();
  projectsDbMocks.dbGetMock.mockReset();
  projectsDbMocks.selectedRecovery.mockReset().mockResolvedValue(0);
  projectsDbMocks.readyClaims
    .mockReset()
    .mockResolvedValue({ valid: true, pending: false, journals: [] });
  projectsDbMocks.initDBMock.mockResolvedValue(createDb(projectsDbMocks));
  projectsDbMocks.assertAssetWriteAdmissionMock.mockResolvedValue(undefined);
  projectsDbMocks.releaseTransitionsMock.mockReset().mockResolvedValue(undefined);
  projectsDbMocks.readyJournalsMock.mockReset().mockResolvedValue([]);
  projectsDbMocks.cancelPublicationMock.mockReset().mockResolvedValue(undefined);
  projectsDbMocks.releaseReadyMock.mockReset().mockResolvedValue(undefined);
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

/** Build the retained ready journal for an annotation resource attachment. */
export function createAnnotationPublicationJournal(
  ref: AssetRef,
  claim: NonNullable<ProjectAssetPublicationOptions['requiredReviewAnnotationEffect']>
): AssetReadyJournal {
  return {
    journalId: 'journal-1',
    domain: 'project-assets',
    createdAt: 1,
    assetRefs: [ref],
    payload: {
      entry: {
        id: 'mark',
        assetId: ref.assetId,
        mimeType: 'image/png',
        size: ref.size,
        createdAt: 1,
      },
      filename: 'mark.png',
      expectedAssetId: null,
      publishToLibrary: false,
      requiredReviewAnnotationEffect: claim,
    },
  };
}

/** Input for a retained private annotation attachment in facade tests. */
export function createAnnotationResourceInput(
  claim: NonNullable<ProjectAssetPublicationOptions['requiredReviewAnnotationEffect']>
): Parameters<(typeof import('./index'))['prepareProjectAsset']> {
  return [
    new Blob(['image'], { type: 'image/png' }),
    'image/png',
    'mark.png',
    'mark',
    1,
    undefined,
    { publishToLibrary: false, requiredReviewAnnotationEffect: claim },
  ];
}

/** Immutable attachment identity used by annotation publication tests. */
export function createAnnotationResourceClaim() {
  return {
    aggregateId: 'review',
    sourceAssetId: 'source',
    snapshotId: `effect:${'a'.repeat(64)}`,
    resourceId: 'mark',
    sha256: 'b'.repeat(64),
  };
}
