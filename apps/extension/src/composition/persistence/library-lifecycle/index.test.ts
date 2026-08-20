import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createVideoProjectEntry,
  createVideoProjectEntryWithMediaClip,
} from '../projects/index.test-support';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import { createScenarioProject } from '../../../features/scenario/project/factories/project';

const persistenceMocks = vi.hoisted(() => ({
  getMediaThumbnail: vi.fn(),
  listAggregatePresentations: vi.fn(),
  listImageWorkspaces: vi.fn(),
  listMediaLibrary: vi.fn(),
  listScenarioAssets: vi.fn(),
  listScenarioExports: vi.fn(),
  listScenarioProjectEntries: vi.fn(),
  listScenarioStepEditorDocuments: vi.fn(),
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

vi.mock('../aggregate-presentations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../aggregate-presentations')>()),
  listAggregatePresentations: persistenceMocks.listAggregatePresentations,
}));
vi.mock('../image-workspaces', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../image-workspaces')>()),
  listImageWorkspaces: persistenceMocks.listImageWorkspaces,
}));
vi.mock('../media-library', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../media-library')>()),
  getMediaThumbnail: persistenceMocks.getMediaThumbnail,
  listMediaLibrary: persistenceMocks.listMediaLibrary,
}));
vi.mock('../scenario/editor-documents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../scenario/editor-documents')>()),
  listScenarioStepEditorDocuments: persistenceMocks.listScenarioStepEditorDocuments,
}));
vi.mock('../projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../projects')>()),
  listVideoProjectEntries: persistenceMocks.listVideoProjectEntries,
}));
vi.mock('../scenario/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../scenario/projects')>()),
  listScenarioAssets: persistenceMocks.listScenarioAssets,
  listScenarioExports: persistenceMocks.listScenarioExports,
  listScenarioProjectEntries: persistenceMocks.listScenarioProjectEntries,
}));
import {
  createLibraryLifecycle,
  cleanupDrafts,
  DEFAULT_LOCAL_STORAGE_POLICY,
  getLibraryStorageUsage,
  promoteStoredItem,
} from '.';

function createMissingProjectAssetObjectStore(
  project: Pick<
    ReturnType<typeof createVideoProjectEntryWithMediaClip>,
    'id' | 'workspaceRevision'
  >,
  put: ReturnType<typeof vi.fn>
) {
  return (name: string) => {
    switch (name) {
      case 'video_projects':
        return { get: vi.fn(async () => project), put };
      case 'project_assets':
      case 'image_workspaces':
        return { get: vi.fn(async () => undefined) };
      case 'aggregate_presentations':
        return {
          get: vi.fn(async () => ({
            aggregateId: project.id,
            aggregateKind: 'video-project',
            presentationRevision: project.workspaceRevision,
            thumbnailBlob: new Blob(['cover']),
            updatedAt: 10,
          })),
        };
      case 'media_library':
        return { getAll: vi.fn(async () => []), put };
      default:
        return { get: vi.fn(async () => undefined), put };
    }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  persistenceMocks.listAggregatePresentations.mockResolvedValue([]);
  persistenceMocks.listImageWorkspaces.mockResolvedValue([]);
  persistenceMocks.getMediaThumbnail.mockResolvedValue(undefined);
  persistenceMocks.listMediaLibrary.mockResolvedValue([]);
  persistenceMocks.listScenarioAssets.mockResolvedValue([]);
  persistenceMocks.listScenarioExports.mockResolvedValue([]);
  persistenceMocks.listScenarioProjectEntries.mockResolvedValue([]);
  persistenceMocks.listScenarioStepEditorDocuments.mockResolvedValue([]);
  persistenceMocks.listVideoProjectEntries.mockResolvedValue([]);
  persistenceMocks.runWithIndexedDbMutation.mockResolvedValue(true);
});

describe('library lifecycle cleanup and usage', () => {
  it('cleans only expired temporary records with separate video retention', async () => {
    const day = 24 * 60 * 60 * 1000;
    const now = 100 * day;
    persistenceMocks.listMediaLibrary.mockResolvedValue([
      {
        id: 'draft-image',
        lifecycle: createLibraryLifecycle('temporary', now - 31 * day),
        source: { kind: 'screenshot' },
      },
      {
        id: 'fresh-image',
        lifecycle: createLibraryLifecycle('temporary', now - day),
        source: { kind: 'screenshot' },
      },
      {
        id: 'draft-video',
        lifecycle: createLibraryLifecycle('temporary', now - 8 * day),
        source: { kind: 'recording', recordingId: 'recording-1' },
      },
      {
        id: 'library-image',
        lifecycle: createLibraryLifecycle('library', now - 90 * day),
        source: { kind: 'screenshot' },
      },
    ]);
    persistenceMocks.listVideoProjectEntries.mockResolvedValue([
      createVideoProjectEntry(
        { id: 'video-project-1' },
        { id: 'video-project-1', lifecycle: createLibraryLifecycle('temporary', now - 31 * day) }
      ),
      createVideoProjectEntry(
        {
          baseRecordingId: 'video-recording-1',
          id: 'video-project-2',
          source: { kind: 'recording', recordingId: 'video-recording-1' },
        },
        { id: 'video-project-2', lifecycle: createLibraryLifecycle('temporary', now - 8 * day) }
      ),
    ]);
    persistenceMocks.listScenarioProjectEntries.mockResolvedValue([
      { id: 'scenario-1', lifecycle: createLibraryLifecycle('temporary', now - 31 * day) },
      { id: 'scenario-fresh', lifecycle: createLibraryLifecycle('temporary', now - day) },
      { id: 'scenario-library', lifecycle: createLibraryLifecycle('library', now - 90 * day) },
    ]);
    await expect(cleanupDrafts({ now, policy: DEFAULT_LOCAL_STORAGE_POLICY })).resolves.toEqual({
      deletedCount: 5,
      deletedIds: [
        'video-project:video-project-1',
        'video-project:video-project-2',
        'draft-image',
        'draft-video',
        'scenario:scenario-1',
      ],
    });
  });

  it('keeps drafts when cleanup is disabled unless deletion is explicitly requested', async () => {
    persistenceMocks.listMediaLibrary.mockResolvedValue([
      {
        id: 'media-1',
        lifecycle: createLibraryLifecycle('temporary', 1),
        source: { kind: 'screenshot' },
      },
    ]);
    const policy = { ...DEFAULT_LOCAL_STORAGE_POLICY, cleanupEnabled: false };

    await expect(cleanupDrafts({ now: 10_000, policy })).resolves.toEqual({
      deletedCount: 0,
      deletedIds: [],
    });
    await expect(cleanupDrafts({ includeUnexpired: true, now: 10_000, policy })).resolves.toEqual({
      deletedCount: 1,
      deletedIds: ['media-1'],
    });
  });

  it('reports media and workspace bytes by storage class while treating legacy rows as library', async () => {
    const videoProject = createVideoProjectEntry(
      { id: 'usage-video' },
      { lifecycle: createLibraryLifecycle('temporary', 1) }
    );
    const imageWorkspace = {
      aggregateId: 'usage-image',
      createdAt: 1,
      document: createEditorDocumentFixture(),
      revision: 1,
      sourceTitle: null,
      sourceUrl: null,
      updatedAt: 1,
    };
    const legacyVideoProject = createVideoProjectEntry({ id: 'usage-video-legacy' });
    const scenarioProject = createScenarioProject('Usage scenario');
    const scenario = {
      createdAt: 1,
      id: scenarioProject.id,
      lifecycle: createLibraryLifecycle('library', 1),
      project: scenarioProject,
      updatedAt: 1,
    };
    persistenceMocks.listMediaLibrary.mockResolvedValue([
      { id: 'usage-image', size: 10, lifecycle: createLibraryLifecycle('temporary', 1) },
      { size: 20, lifecycle: createLibraryLifecycle('library', 1) },
      { size: 5 },
      { size: -10, lifecycle: createLibraryLifecycle('temporary', 1) },
      {
        hasThumbnail: true,
        id: 'thumbnail-media',
        lifecycle: createLibraryLifecycle('temporary', 1),
        size: 2,
      },
      { hasThumbnail: true, id: 'missing-thumbnail-media', size: 1 },
    ]);
    persistenceMocks.listVideoProjectEntries.mockResolvedValue([videoProject, legacyVideoProject]);
    persistenceMocks.listImageWorkspaces.mockResolvedValue([imageWorkspace]);
    persistenceMocks.listAggregatePresentations.mockResolvedValue([
      {
        aggregateId: 'usage-image',
        aggregateKind: 'image',
        presentationRevision: 1,
        previewBlob: new Blob(['preview']),
        thumbnailBlob: new Blob(['thumb']),
        updatedAt: 1,
      },
      {
        aggregateId: videoProject.id,
        aggregateKind: 'video-project',
        presentationRevision: 0,
        previewBlob: new Blob(['video-preview']),
        thumbnailBlob: new Blob(['video-thumb']),
        updatedAt: 1,
      },
      {
        aggregateId: scenario.id,
        aggregateKind: 'scenario',
        presentationRevision: 0,
        thumbnailBlob: new Blob(['scenario-thumb']),
        updatedAt: 1,
      },
      {
        aggregateId: 'orphan-presentation',
        aggregateKind: 'image',
        presentationRevision: 0,
        thumbnailBlob: new Blob(['ignored']),
        updatedAt: 1,
      },
    ]);
    persistenceMocks.listScenarioProjectEntries.mockResolvedValue([scenario]);
    persistenceMocks.listScenarioAssets.mockResolvedValue([{ size: 7 }]);
    persistenceMocks.listScenarioExports.mockResolvedValue([{ size: 3 }]);
    const stepDocument = {
      createdAt: 1,
      document: createEditorDocumentFixture(),
      projectId: scenario.id,
      stepId: 'usage-step',
      updatedAt: 1,
    };
    persistenceMocks.listScenarioStepEditorDocuments.mockResolvedValue([stepDocument]);
    persistenceMocks.getMediaThumbnail.mockImplementation(async (id: string) =>
      id === 'thumbnail-media'
        ? { blob: new Blob(['x']) }
        : id === `video-project:${videoProject.id}`
          ? { blob: new Blob(['draft']) }
          : id === `video-project:${legacyVideoProject.id}`
            ? { blob: new Blob(['library']) }
            : id.startsWith('scenario-export:')
              ? { blob: new Blob(['four']) }
              : id.startsWith('scenario:')
                ? { blob: new Blob(['two']) }
                : undefined
    );

    const jsonBytes = (value: unknown) =>
      new TextEncoder().encode(JSON.stringify(value)).byteLength;
    const expectedDrafts =
      18 +
      jsonBytes(videoProject.project) +
      jsonBytes(imageWorkspace) +
      new Blob(['preview']).size +
      new Blob(['thumb']).size +
      new Blob(['video-preview']).size +
      new Blob(['video-thumb']).size;
    const expectedLibrary =
      33 +
      jsonBytes(legacyVideoProject.project) +
      jsonBytes(scenario.project) +
      7 +
      3 +
      jsonBytes(stepDocument) +
      4 +
      3 +
      new Blob(['scenario-thumb']).size;

    await expect(getLibraryStorageUsage()).resolves.toEqual({
      draftsBytes: expectedDrafts,
      libraryBytes: expectedLibrary,
      totalBytes: expectedDrafts + expectedLibrary,
    });
  });
});

describe('library lifecycle concurrent cleanup', () => {
  it('rechecks lifecycle at commit time and keeps a concurrently promoted media draft', async () => {
    const expired = {
      blob: new Blob(['image'], { type: 'image/png' }),
      createdAt: 1,
      duration: null,
      filename: 'draft.png',
      height: 1,
      id: 'draft-image',
      kind: 'image',
      lifecycle: createLibraryLifecycle('temporary', 1),
      mimeType: 'image/png',
      originalFilename: 'draft.png',
      size: 5,
      source: { kind: 'screenshot' },
      sourceFavicon: null,
      sourceTitle: null,
      sourceUrl: null,
      tags: [],
      updatedAt: 1,
      width: 1,
    };
    persistenceMocks.listMediaLibrary.mockResolvedValue([expired]);
    const deleteMedia = vi.fn();
    persistenceMocks.runWithIndexedDbMutation.mockImplementationOnce(async (effect) =>
      effect({
        transaction: vi.fn(() => ({
          done: Promise.resolve(),
          objectStore: vi.fn((name: string) =>
            name === 'media_library'
              ? {
                  delete: deleteMedia,
                  get: vi.fn(async () => ({
                    ...expired,
                    lifecycle: createLibraryLifecycle('library', 2),
                  })),
                }
              : { delete: vi.fn(), getAll: vi.fn(async () => []) }
          ),
        })),
      })
    );

    await expect(
      cleanupDrafts({ includeUnexpired: true, now: 3, policy: DEFAULT_LOCAL_STORAGE_POLICY })
    ).resolves.toEqual({ deletedCount: 0, deletedIds: [] });
    expect(deleteMedia).not.toHaveBeenCalled();
  });

  it('rechecks project references at commit time before deleting media bytes', async () => {
    const lifecycle = createLibraryLifecycle('temporary', 1);
    const media = {
      id: 'recording:recording-1',
      lifecycle,
      source: { kind: 'recording' as const, recordingId: 'recording-1' },
    };
    const linkedProject = createVideoProjectEntry(
      {
        baseRecordingId: 'recording-1',
        source: { kind: 'recording', recordingId: 'recording-1' },
      },
      { lifecycle }
    );
    const deleteMedia = vi.fn();
    persistenceMocks.listMediaLibrary.mockResolvedValue([media]);
    persistenceMocks.runWithIndexedDbMutation.mockImplementationOnce(async (effect) =>
      effect({
        transaction: vi.fn(() => ({
          done: Promise.resolve(),
          objectStore: vi.fn((name: string) =>
            name === 'media_library'
              ? { delete: deleteMedia, get: vi.fn(async () => media) }
              : name === 'video_projects'
                ? { getAll: vi.fn(async () => [linkedProject]) }
                : { delete: vi.fn(), getAll: vi.fn(async () => []) }
          ),
        })),
      })
    );

    await expect(
      cleanupDrafts({ includeUnexpired: true, now: 2, policy: DEFAULT_LOCAL_STORAGE_POLICY })
    ).resolves.toEqual({ deletedCount: 0, deletedIds: [] });
    expect(deleteMedia).not.toHaveBeenCalled();
  });
});

describe('library lifecycle promotion', () => {
  it('atomically promotes a recording-backed video project graph and aborts when a dependency is missing', async () => {
    const lifecycle = createLibraryLifecycle('temporary', 10);
    const project = createVideoProjectEntry(
      {
        baseRecordingId: 'recording-1',
        source: { kind: 'recording', recordingId: 'recording-1' },
      },
      { lifecycle }
    );
    const projectPut = vi.fn();
    const recordingPut = vi.fn();
    const mediaPut = vi.fn();
    const recording = {
      assetId: 'asset-recording-1',
      createdAt: 10,
      filename: 'recording.webm',
      id: 'recording-1',
      lifecycle: createLibraryLifecycle('library', 20),
      mimeType: 'video/webm',
      size: 5,
    };
    const media = {
      blob: new Blob(['video'], { type: 'video/webm' }),
      createdAt: 10,
      duration: 1,
      filename: recording.filename,
      height: 1,
      id: 'recording:recording-1',
      kind: 'recording',
      lifecycle,
      mimeType: 'video/webm',
      originalFilename: recording.filename,
      size: 5,
      source: { kind: 'recording', recordingId: 'recording-1' },
      sourceFavicon: null,
      sourceTitle: null,
      sourceUrl: null,
      tags: [],
      updatedAt: 10,
      width: 1,
    };
    const run = (recordingValue: unknown) => async (effect: (db: unknown) => unknown) =>
      effect({
        transaction: vi.fn(() => ({
          done: Promise.resolve(),
          objectStore: vi.fn((name: string) =>
            name === 'video_projects'
              ? { get: vi.fn(async () => project), put: projectPut }
              : name === 'recordings'
                ? { get: vi.fn(async () => recordingValue), put: recordingPut }
                : name === 'aggregate_presentations'
                  ? {
                      get: vi.fn(async () => ({
                        aggregateId: project.id,
                        aggregateKind: 'video-project',
                        presentationRevision: project.workspaceRevision,
                        thumbnailBlob: new Blob(['cover']),
                        updatedAt: 10,
                      })),
                    }
                  : { getAll: vi.fn(async () => [media]), put: mediaPut }
          ),
        })),
      });
    persistenceMocks.runWithIndexedDbMutation.mockImplementationOnce(run(recording));
    await promoteStoredItem({ id: project.id, kind: 'video-project' });
    expect(projectPut).toHaveBeenCalledWith(
      expect.objectContaining({ lifecycle: expect.objectContaining({ storageClass: 'library' }) })
    );
    expect(recordingPut).toHaveBeenCalledTimes(1);
    expect(mediaPut).toHaveBeenCalledTimes(1);

    projectPut.mockClear();
    persistenceMocks.runWithIndexedDbMutation.mockImplementationOnce(run(undefined));
    await expect(promoteStoredItem({ id: project.id, kind: 'video-project' })).rejects.toThrow(
      'Linked recording recording-1 was not found'
    );
    expect(projectPut).not.toHaveBeenCalled();
  });

  it('fails video-project promotion closed when a project asset is missing', async () => {
    const project = {
      ...createVideoProjectEntryWithMediaClip(),
      lifecycle: createLibraryLifecycle('temporary', 10),
    };
    const put = vi.fn();
    persistenceMocks.runWithIndexedDbMutation.mockImplementationOnce(async (effect) =>
      effect({
        transaction: vi.fn(() => ({
          done: Promise.resolve(),
          objectStore: vi.fn(createMissingProjectAssetObjectStore(project, put)),
        })),
      })
    );

    await expect(promoteStoredItem({ id: project.id, kind: 'video-project' })).rejects.toThrow(
      'Linked project asset project-asset-1 was not found'
    );
    expect(put).not.toHaveBeenCalled();
  });
});

describe('library lifecycle media promotion', () => {
  it('atomically promotes media and its recording dependency', async () => {
    const lifecycle = createLibraryLifecycle('temporary', 10);
    const media = {
      blob: new Blob(['media'], { type: 'video/webm' }),
      createdAt: 10,
      duration: null,
      filename: 'recording.webm',
      height: null,
      id: 'recording:recording-1',
      kind: 'recording',
      lifecycle,
      mimeType: 'video/webm',
      originalFilename: 'recording.webm',
      size: 5,
      source: { kind: 'recording', recordingId: 'recording-1' },
      sourceFavicon: null,
      sourceTitle: null,
      sourceUrl: null,
      tags: [],
      updatedAt: 10,
      width: null,
    };
    const recording = {
      assetId: 'asset-recording-1',
      createdAt: 10,
      filename: 'recording.webm',
      id: 'recording-1',
      lifecycle: createLibraryLifecycle('library', 20),
      mimeType: 'video/webm',
      size: 5,
    };
    const puts: unknown[] = [];
    const stores = {
      media_library: {
        get: vi.fn(async () => media),
        getAll: vi.fn(async () => [media]),
        put: vi.fn(async (value) => puts.push(value)),
      },
      recordings: {
        get: vi.fn(async () => recording),
        put: vi.fn(async (value) => puts.push(value)),
      },
    };
    const transaction = {
      done: Promise.resolve(),
      objectStore: (name: keyof typeof stores) => stores[name],
    };
    persistenceMocks.runWithIndexedDbMutation.mockImplementationOnce(async (effect) =>
      effect({ transaction: vi.fn(() => transaction) })
    );
    vi.spyOn(Date, 'now').mockReturnValue(50);

    await promoteStoredItem({ id: media.id, kind: 'media' });

    expect(puts).toHaveLength(2);
    expect(puts).toEqual([
      expect.objectContaining({
        lifecycle: { savedAt: 20, storageClass: 'library', updatedAt: 20 },
      }),
      expect.objectContaining({
        lifecycle: { savedAt: 50, storageClass: 'library', updatedAt: 50 },
      }),
    ]);
  });

  it('fails recording media promotion closed when its bytes are missing', async () => {
    const lifecycle = createLibraryLifecycle('temporary', 10);
    const media = {
      createdAt: 10,
      duration: 1,
      filename: 'recording.webm',
      height: 1,
      id: 'recording:missing',
      kind: 'recording',
      lifecycle,
      mimeType: 'video/webm',
      originalFilename: 'recording.webm',
      size: 5,
      source: { kind: 'recording', recordingId: 'missing' },
      sourceFavicon: null,
      sourceTitle: null,
      sourceUrl: null,
      tags: [],
      updatedAt: 10,
      width: 1,
    };
    const put = vi.fn();
    persistenceMocks.runWithIndexedDbMutation.mockImplementationOnce(async (effect) =>
      effect({
        transaction: vi.fn(() => ({
          done: Promise.resolve(),
          objectStore: vi.fn((name: string) =>
            name === 'media_library'
              ? { get: vi.fn(async () => media), put }
              : name === 'recordings'
                ? { get: vi.fn(async () => undefined), put }
                : { getAll: vi.fn(async () => []), put }
          ),
        })),
      })
    );

    await expect(promoteStoredItem({ id: media.id, kind: 'media' })).rejects.toThrow(
      'Linked recording missing was not found'
    );
    expect(put).not.toHaveBeenCalled();
  });

  it('fails project-asset media promotion closed when its bytes are missing', async () => {
    const media = {
      createdAt: 10,
      duration: null,
      filename: 'asset.png',
      height: 1,
      id: 'project-asset:missing',
      kind: 'image',
      lifecycle: createLibraryLifecycle('temporary', 10),
      mimeType: 'image/png',
      originalFilename: 'asset.png',
      size: 5,
      source: { kind: 'project-asset', projectAssetId: 'missing' },
      sourceFavicon: null,
      sourceTitle: null,
      sourceUrl: null,
      tags: [],
      updatedAt: 10,
      width: 1,
    };
    const put = vi.fn();
    persistenceMocks.runWithIndexedDbMutation.mockImplementationOnce(async (effect) =>
      effect({
        transaction: vi.fn(() => ({
          done: Promise.resolve(),
          objectStore: vi.fn((name: string) =>
            name === 'media_library'
              ? { get: vi.fn(async () => media), put }
              : name === 'project_assets'
                ? { get: vi.fn(async () => undefined) }
                : name === 'image_workspaces'
                  ? { get: vi.fn(async () => undefined) }
                  : name === 'aggregate_presentations'
                    ? {
                        get: vi.fn(async () => ({
                          aggregateId: media.id,
                          aggregateKind: 'image',
                          presentationRevision: 0,
                          thumbnailBlob: new Blob(['preview']),
                          updatedAt: 10,
                        })),
                      }
                    : { getAll: vi.fn(async () => []), put }
          ),
        })),
      })
    );

    await expect(promoteStoredItem({ id: media.id, kind: 'media' })).rejects.toThrow(
      'Linked project asset missing was not found'
    );
    expect(put).not.toHaveBeenCalled();
  });
});
