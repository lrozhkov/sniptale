import type { ReviewOriginalSpeech } from '../../../features/video/review/original-speech';
import { reviewSpeechTextSignature } from '../../../features/video/review/speech-transcript';
import { saveVideoProject } from './index';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  VideoProjectAssetType,
  type VideoProjectAsset,
} from '../../../features/video/project/types/index';
import { createVideoProject, createVideoProjectEntry } from './index.test-support.ts';
import { createMediaLibraryEntry } from './index.test-support.ts';

const projectsDbMocks = vi.hoisted(() => ({
  buildProjectAssetMediaEntryMock: vi.fn(),
  buildProjectExportMediaEntryMock: vi.fn(),
  buildRecordingMediaEntryMock: vi.fn(),
  createProjectAssetMediaIdMock: vi.fn(),
  createRecordingMediaIdMock: vi.fn(),
  dbGetMock: vi.fn(),
  getRecordingMock: vi.fn(),
  initDBMock: vi.fn(),
  publishMediaHubLibraryChangedMock: vi.fn(),
  txDeleteMock: vi.fn(),
  txGetAllMock: vi.fn(),
  txGetMock: vi.fn(),
  txPutMock: vi.fn(),
  upsertMediaEntryMock: vi.fn(),
  recoverProjectMediaPublicationsMock: vi.fn(),
}));

vi.mock('../assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assets')>()),
  completePhysicalDeleteOperation: vi.fn(async () => undefined),
}));

vi.mock('./asset-publication', async (importOriginal) => ({
  ...(await importOriginal()),
  recoverProjectMediaPublications: projectsDbMocks.recoverProjectMediaPublicationsMock,
}));

vi.mock('../infrastructure/indexed-db/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/indexed-db/core')>()),
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

vi.mock('../media-library/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../media-library/store')>()),
  upsertMediaEntry: projectsDbMocks.upsertMediaEntryMock,
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
    transaction: vi.fn(() => ({
      done: Promise.resolve(),
      objectStore: vi.fn(() => ({
        delete: projectsDbMocks.txDeleteMock,
        index: () => ({ count: async () => 0, getAll: async () => [], getAllKeys: async () => [] }),
        get: projectsDbMocks.txGetMock,
        getAll: projectsDbMocks.txGetAllMock,
        put: projectsDbMocks.txPutMock,
      })),
    })),
  };
}

function createProjectOwnedVideoAsset(id: string) {
  return {
    id,
    type: VideoProjectAssetType.VIDEO,
    name: `${id}.mp4`,
    source: { kind: 'project-asset' as const, projectAssetId: id },
    metadata: {
      width: 1280,
      height: 720,
      duration: 5,
      mimeType: 'video/mp4',
      size: 20,
      hasAudio: false,
      audioPeaks: null,
    },
    createdAt: 100,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  projectsDbMocks.initDBMock.mockResolvedValue(createDb());
  projectsDbMocks.createProjectAssetMediaIdMock.mockImplementation(
    (id: string) => `project-asset:${id}`
  );
  projectsDbMocks.createRecordingMediaIdMock.mockImplementation((id: string) => `recording:${id}`);
  projectsDbMocks.upsertMediaEntryMock.mockResolvedValue(undefined);
  projectsDbMocks.getRecordingMock.mockResolvedValue(undefined);
  projectsDbMocks.txGetAllMock.mockResolvedValue([]);
  projectsDbMocks.recoverProjectMediaPublicationsMock.mockResolvedValue(undefined);
});

it('journals removed project-owned assets while saving without revoking mounted Undo sources', async () => {
  const existingProject = createVideoProject({
    assets: [createProjectOwnedVideoAsset('asset-a'), createProjectOwnedVideoAsset('asset-b')],
  });
  const nextProject = {
    ...existingProject,
    assets: [existingProject.assets[0]!],
  };

  projectsDbMocks.txGetMock.mockImplementation(async (key: string) =>
    key === existingProject.id
      ? createVideoProjectEntry(existingProject)
      : key === 'asset-b'
        ? { id: 'asset-b', assetId: 'asset-b-bytes', createdAt: 1, mimeType: 'video/mp4', size: 10 }
        : undefined
  );
  vi.spyOn(Date, 'now').mockReturnValue(1000);

  await saveVideoProject(nextProject);

  expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'project-1',
      updatedAt: 1000,
    })
  );
  expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalled();
  expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'physical-delete',
      assetIds: [],
      privateSources: [{ projectAssetId: 'asset-b', expectedAssetId: 'asset-b-bytes' }],
    })
  );
  expect(projectsDbMocks.publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('update', [
    'video-project:project-1',
  ]);
});

it('saves a linked recording and its library media when a video project uses it', async () => {
  const { saveVideoProject } = await import('./index');
  const lifecycle = { storageClass: 'temporary' as const, savedAt: null, updatedAt: 1 };
  const recording = {
    assetId: 'recording-object-1',
    createdAt: 1,
    filename: 'recording.webm',
    id: 'recording-1',
    lifecycle,
    mimeType: 'video/webm',
    size: 20,
  };
  const media = createMediaLibraryEntry({
    id: 'recording:recording-1',
    kind: 'recording',
    lifecycle,
    source: { kind: 'recording', recordingId: 'recording-1' },
  });
  projectsDbMocks.txGetMock.mockImplementation(async (key: string) =>
    key === recording.id ? recording : key === media.id ? media : undefined
  );

  await saveVideoProject(createVideoProject({ baseRecordingId: recording.id }), {
    storageClass: 'temporary',
  });

  expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({
      id: recording.id,
      lifecycle: expect.objectContaining({ storageClass: 'library', savedAt: expect.any(Number) }),
    })
  );
  expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({
      id: media.id,
      lifecycle: expect.objectContaining({ storageClass: 'library', savedAt: expect.any(Number) }),
    })
  );
});

it('does not announce a saved project when linked recording promotion fails', async () => {
  const { saveVideoProject } = await import('./index');
  projectsDbMocks.txGetMock.mockImplementation(async (key: string) =>
    key === 'recording-1'
      ? {
          assetId: 'recording-object-1',
          createdAt: 1,
          filename: 'recording.webm',
          id: 'recording-1',
          lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 1 },
          mimeType: 'video/webm',
          size: 20,
        }
      : undefined
  );
  projectsDbMocks.txPutMock
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('recording write failed'));

  await expect(
    saveVideoProject(createVideoProject({ baseRecordingId: 'recording-1' }))
  ).rejects.toThrow('recording write failed');
  expect(projectsDbMocks.publishMediaHubLibraryChangedMock).not.toHaveBeenCalled();
});

it('preserves removed project-owned assets while another project references them', async () => {
  const { saveVideoProject } = await import('./index');
  const sharedAsset = createProjectOwnedVideoAsset('asset-shared');
  const existingProject = createVideoProject({ assets: [sharedAsset] });
  const nextProject = { ...existingProject, assets: [] };

  projectsDbMocks.txGetMock.mockResolvedValue(createVideoProjectEntry(existingProject));
  projectsDbMocks.txGetAllMock.mockResolvedValue([
    createVideoProjectEntry(existingProject),
    createVideoProjectEntry({ assets: [sharedAsset], id: 'project-2' }, { id: 'project-2' }),
  ]);

  await saveVideoProject(nextProject);

  expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'project-1' })
  );
  expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalledWith('asset-shared');
  expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalledWith('project-asset:asset-shared');
});

it.each(['library', 'temporary'] as const)(
  'preserves a published %s project asset when detached',
  async (storageClass) => {
    const { saveVideoProject } = await import('./index');
    const savedAsset = createProjectOwnedVideoAsset('asset-saved');
    const existingProject = createVideoProject({ assets: [savedAsset] });
    projectsDbMocks.txGetMock.mockImplementation(async (key: string) =>
      key === 'project-1'
        ? createVideoProjectEntry(existingProject)
        : key === 'project-asset:asset-saved'
          ? createMediaLibraryEntry({
              id: 'project-asset:asset-saved',
              source: { kind: 'project-asset', projectAssetId: 'asset-saved' },
              lifecycle: {
                storageClass,
                savedAt: storageClass === 'library' ? 1 : null,
                updatedAt: 1,
              },
            })
          : undefined
    );

    await saveVideoProject({ ...existingProject, assets: [] });

    expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalledWith('asset-saved');
    expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalledWith('project-asset:asset-saved');
    if (storageClass === 'temporary') {
      expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'project-asset:asset-saved',
          lifecycle: expect.objectContaining({
            storageClass: 'library',
            savedAt: expect.any(Number),
          }),
        })
      );
    } else {
      expect(projectsDbMocks.txPutMock).not.toHaveBeenCalledWith(
        expect.objectContaining({ id: 'project-asset:asset-saved' })
      );
    }
  }
);

it('preserves newer persisted project-owned assets for legacy unguarded saves', async () => {
  const { saveVideoProject } = await import('./index');
  const existingProject = createVideoProject({
    assets: [createProjectOwnedVideoAsset('asset-a'), createProjectOwnedVideoAsset('asset-b')],
    updatedAt: 500,
  });
  const staleProject = {
    ...existingProject,
    assets: [existingProject.assets[0]!],
    updatedAt: 100,
  };

  projectsDbMocks.txGetMock.mockResolvedValue(createVideoProjectEntry(existingProject));
  vi.spyOn(Date, 'now').mockReturnValue(1000);

  await saveVideoProject(staleProject);

  expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({
      project: expect.objectContaining({
        assets: [
          expect.objectContaining({ id: 'asset-a' }),
          expect.objectContaining({ id: 'asset-b' }),
        ],
      }),
    })
  );
  expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalled();
});

it('rejects stale video project saves before any write when the base revision changed', async () => {
  const { saveVideoProject } = await import('./index');
  const existingProject = createVideoProject({
    assets: [createProjectOwnedVideoAsset('asset-a'), createProjectOwnedVideoAsset('asset-b')],
    name: 'Newer name',
    updatedAt: 500,
  });
  const staleProject = {
    ...existingProject,
    assets: [existingProject.assets[0]!],
    name: 'Stale name',
    updatedAt: 100,
  };

  projectsDbMocks.txGetMock.mockResolvedValue(createVideoProjectEntry(existingProject));

  await expect(saveVideoProject(staleProject, { baseUpdatedAt: 100 })).rejects.toThrow(
    'Video project project-1 was changed before this save completed'
  );

  expect(projectsDbMocks.txPutMock).not.toHaveBeenCalled();
  expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalled();
  expect(projectsDbMocks.publishMediaHubLibraryChangedMock).not.toHaveBeenCalled();
});

it('commits video project mutations with the supplied base revision', async () => {
  const { commitVideoProjectMutation } = await import('./index-mutations');
  const existingProject = createVideoProject({
    assets: [createProjectOwnedVideoAsset('asset-a'), createProjectOwnedVideoAsset('asset-b')],
    updatedAt: 500,
  });
  const nextProject = {
    ...existingProject,
    name: 'Fresh mutation',
  };

  projectsDbMocks.txGetMock.mockResolvedValue(createVideoProjectEntry(existingProject));
  projectsDbMocks.dbGetMock.mockResolvedValue(
    createVideoProjectEntry({ ...nextProject, updatedAt: 1000 })
  );

  await expect(commitVideoProjectMutation(nextProject, { baseRevision: 500 })).resolves.toEqual(
    expect.objectContaining({ name: 'Fresh mutation', updatedAt: 1000 })
  );

  expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({
      project: expect.objectContaining({
        name: 'Fresh mutation',
      }),
    })
  );
});

it('returns the project committed by the transaction without a second read', async () => {
  const { commitVideoProjectMutation } = await import('./index-mutations');
  const nextProject = createVideoProject({ name: 'Fallback mutation' });

  projectsDbMocks.txGetMock.mockReset().mockResolvedValue(undefined);
  vi.spyOn(Date, 'now').mockReturnValue(1000);

  await expect(commitVideoProjectMutation(nextProject)).resolves.toEqual({
    ...nextProject,
    updatedAt: 1000,
  });
  expect(projectsDbMocks.dbGetMock).not.toHaveBeenCalled();
});

it('commits a video workspace with explicit placement and returns its durable revision', async () => {
  const { commitVideoProjectWorkspaceMutation } = await import('./index-mutations');
  const project = createVideoProject({ name: 'Workspace commit' });
  projectsDbMocks.txGetMock.mockResolvedValue(undefined);

  await expect(
    commitVideoProjectWorkspaceMutation(project, {
      expectedWorkspaceRevision: null,
      expectedProject: null,
    })
  ).resolves.toEqual({
    project: expect.objectContaining({ id: project.id, name: 'Workspace commit' }),
    workspaceRevision: 1,
  });
  expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({
      lifecycle: expect.objectContaining({ storageClass: 'library' }),
      workspaceRevision: 1,
    })
  );
});

it('saves a new video workspace directly in the library despite the capture default', async () => {
  const { commitVideoProjectWorkspaceMutation } = await import('./index-mutations');
  const project = createVideoProject({ id: 'default-workspace' });
  projectsDbMocks.txGetMock.mockResolvedValue(undefined);

  await expect(
    commitVideoProjectWorkspaceMutation(project, {
      expectedWorkspaceRevision: null,
      expectedProject: null,
    })
  ).resolves.toEqual({
    project: expect.objectContaining({ id: project.id }),
    workspaceRevision: 1,
  });
  expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({
      lifecycle: expect.objectContaining({ storageClass: 'library' }),
      workspaceRevision: 1,
    })
  );
});

it('uses now as createdAt fallback and ignores externally owned assets while saving', async () => {
  const { saveVideoProject } = await import('./index');
  const project = createVideoProject({
    assets: [
      {
        ...createProjectOwnedVideoAsset('external-asset'),
        source: { kind: 'recording', recordingId: 'recording-1' },
      } satisfies VideoProjectAsset,
    ],
  });

  projectsDbMocks.txGetMock.mockImplementation(async (key: string) =>
    key === 'recording-1'
      ? {
          id: key,
          assetId: 'recording-object',
          filename: 'clip.webm',
          mimeType: 'video/webm',
          size: 20,
          createdAt: 1,
        }
      : undefined
  );
  vi.spyOn(Date, 'now').mockReturnValue(2000);
  Reflect.deleteProperty(project, 'createdAt');

  await saveVideoProject(project);

  expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({
      createdAt: 2000,
      id: 'project-1',
      updatedAt: 2000,
    })
  );
  expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalled();
});

it('retains a temporary project in the library with its next revisioned workspace commit', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(1000);
  const { commitVideoProjectWorkspaceMutation } = await import('./index-mutations');
  const project = createVideoProject({ updatedAt: 500 });
  projectsDbMocks.txGetMock.mockResolvedValue({
    ...createVideoProjectEntry(project),
    workspaceRevision: 7,
    lifecycle: { storageClass: 'temporary', savedAt: null, updatedAt: 500 },
  });
  await commitVideoProjectWorkspaceMutation(project, {
    expectedWorkspaceRevision: 7,
    expectedProject: project,
  });
  expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({
      lifecycle: { storageClass: 'library', savedAt: 1000, updatedAt: 1000 },
      workspaceRevision: 8,
    })
  );
});

it.each([
  { parentSaved: false, mirrorSaved: false, sibling: 'temporary' },
  { parentSaved: false, mirrorSaved: false, sibling: 'library' },
  { parentSaved: true, mirrorSaved: false, sibling: 'temporary' },
  { parentSaved: false, mirrorSaved: true, sibling: 'temporary' },
])(
  'promotes project media while preserving independent Trash admission: %j',
  async ({ parentSaved, mirrorSaved, sibling }) => {
    const { saveVideoProject } = await import('./index');
    const lifecycle = (library: boolean) => ({
      storageClass: library ? ('library' as const) : ('temporary' as const),
      savedAt: library ? 100 : null,
      updatedAt: 100,
    });
    const project = createVideoProject({ assets: [createProjectOwnedVideoAsset('asset-1')] });
    const existing = createVideoProjectEntry(project, { lifecycle: lifecycle(parentSaved) });
    const media = createMediaLibraryEntry({
      id: 'project-asset:asset-1',
      lifecycle: { ...lifecycle(mirrorSaved), trashedAt: 500 },
    });
    projectsDbMocks.txGetMock.mockImplementation(async (id: string) =>
      id === project.id ? existing : id === media.id ? media : undefined
    );
    projectsDbMocks.txGetAllMock.mockResolvedValue([
      existing,
      createVideoProjectEntry(
        { id: 'sibling', assets: project.assets },
        {
          lifecycle: lifecycle(sibling === 'library'),
        }
      ),
    ]);
    vi.spyOn(Date, 'now').mockReturnValue(1000);

    await saveVideoProject(project);

    expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: media.id,
        source: media.source,
        lifecycle: {
          storageClass: 'library',
          savedAt: mirrorSaved ? 100 : 1000,
          updatedAt: mirrorSaved ? 100 : 1000,
          trashedAt: 500,
        },
      })
    );
    expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalled();
  }
);

it('does not manufacture a missing media mirror while saving a project with a retained source', async () => {
  const { saveVideoProject } = await import('./index');
  const project = createVideoProject({ assets: [createProjectOwnedVideoAsset('asset-1')] });
  const existing = createVideoProjectEntry(project, {
    lifecycle: { storageClass: 'temporary', savedAt: null, updatedAt: 100 },
  });
  projectsDbMocks.txGetMock.mockImplementation(async (id: string) =>
    id === project.id ? existing : undefined
  );
  projectsDbMocks.txGetAllMock.mockResolvedValue([existing]);

  await saveVideoProject(project);

  expect(projectsDbMocks.txPutMock).toHaveBeenCalledTimes(1);
  expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({ id: project.id })
  );
  expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalled();
});

it('refuses a newly inserted source deleted before the placement could be saved', async () => {
  const { saveVideoProject } = await import('./index');
  const existing = createVideoProject();
  const imported = createProjectOwnedVideoAsset('deleted-acquisition');
  const linked = { ...imported, source: { ...imported.source, originMediaId: 'deleted-original' } };
  projectsDbMocks.txGetMock.mockImplementation(async (key: string) =>
    key === existing.id ? createVideoProjectEntry(existing) : undefined
  );
  await expect(saveVideoProject({ ...existing, assets: [linked] })).rejects.toThrow();
  expect(projectsDbMocks.txPutMock).not.toHaveBeenCalled();
});

it('commits and re-admits authored text without replacing its shared gallery document', async () => {
  const { commitVideoProjectWorkspaceMutation } = await import('./index-mutations');
  const { parseHydratableVideoProject } =
    await import('../../../features/video/project/validation/root');
  const project = createVideoProject({
    version: 5,
    textDocuments: [
      {
        id: 'narration',
        binding: { kind: 'project' },
        document: {
          version: 1,
          fragments: [
            {
              id: 'phrase',
              text: 'Принятый текст',
              originalText: '',
              revision: 2,
              timingRevision: 0,
              start: 0,
              end: 2,
              alignment: 'manual',
              timeDomain: 'result',
              showInVideo: true,
            },
          ],
        },
      },
    ],
  });
  projectsDbMocks.txGetMock.mockResolvedValue(undefined);
  const saved = await commitVideoProjectWorkspaceMutation(project, {
    expectedWorkspaceRevision: null,
    expectedProject: null,
  });
  expect(saved.workspaceRevision).toBe(1);
  const reopened = parseHydratableVideoProject(JSON.parse(JSON.stringify(saved.project)));
  expect(reopened?.textDocuments).toEqual(project.textDocuments);
  expect(reopened?.version).toBe(5);
  expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({
      project: expect.objectContaining({ textDocuments: project.textDocuments, version: 5 }),
    })
  );
});

it('saves dormant background images with the existing asset graph without scheduling their deletion', async () => {
  const { saveVideoProject } = await import('./index');
  const base = createProjectOwnedVideoAsset('background');
  const image: VideoProjectAsset = {
    ...base,
    type: VideoProjectAssetType.IMAGE,
    metadata: { ...base.metadata, duration: null, hasAudio: false, mimeType: 'image/png' },
  };
  const project = createVideoProject({
    version: 14,
    assets: [image],
    sceneBackground: {
      kind: 'solid',
      color: '#123456',
      remembered: { image: { kind: 'image', assetId: image.id, imageFit: 'contain' } },
    },
  });
  const before = structuredClone(project);
  projectsDbMocks.txGetMock.mockImplementation(async (id: string) =>
    id === project.id ? createVideoProjectEntry(project) : undefined
  );
  await saveVideoProject(project);
  expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({
      project: expect.objectContaining({
        version: 14,
        assets: [image],
        sceneBackground: project.sceneBackground,
      }),
    })
  );
  expect(
    projectsDbMocks.txPutMock.mock.calls.flat().some((entry) => entry?.kind === 'physical-delete')
  ).toBe(false);
  expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalled();
  expect(project).toEqual(before);
});

it.each(['none', 'text', 'image'] as const)(
  'retains private logo bytes when another project has a %s watermark',
  async (mode) => {
    const { createQuickEditWatermark, getVideoProjectWatermarkAsset } =
      await import('../../../features/video/project/scene/watermark');
    const shared: VideoProjectAsset = {
      ...createProjectOwnedVideoAsset('logical-logo'),
      type: 'IMAGE',
      source: { kind: 'project-asset', projectAssetId: 'private-logo' },
      metadata: {
        width: 80,
        height: 40,
        duration: null,
        mimeType: 'image/png',
        size: 6,
        hasAudio: false,
        audioPeaks: null,
      },
    };
    const watermark = {
      ...createQuickEditWatermark('Logo'),
      mode: 'image' as const,
      image: {
        assetId: 'project-asset:logical-logo',
        width: 80,
        height: 40,
        size: 0.2,
        opacity: 1,
      },
    };
    const original = createVideoProject({ assets: [shared], version: 20, watermark });
    const held = createVideoProject({
      assets: [structuredClone(shared)],
      version: 20,
      id: 'project-2',
      watermark: { ...structuredClone(watermark), mode },
    });
    const heldBefore = structuredClone(held);
    const detached = { ...original, assets: [] };
    delete detached.watermark;
    projectsDbMocks.txGetMock.mockResolvedValue(createVideoProjectEntry(original));
    projectsDbMocks.txGetAllMock.mockResolvedValue([
      createVideoProjectEntry(original),
      createVideoProjectEntry(held, { id: held.id }),
    ]);
    await saveVideoProject(detached);
    expect(getVideoProjectWatermarkAsset(held)?.source).toEqual({
      kind: 'project-asset',
      projectAssetId: 'private-logo',
    });
    expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalledWith('private-logo');
    expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalledWith('project-asset:private-logo');
    expect(held).toEqual(heldBefore);
  }
);

it.each(['none', 'video'] as const)(
  'retains private bytes held by a %s bookend recipe in another project',
  async (mode) => {
    const { createBookendVideoPresentation } =
      await import('../../../features/video/project/scene/bookend-media');
    const shared = {
      ...createProjectOwnedVideoAsset('logical-movie'),
      source: { kind: 'project-asset' as const, projectAssetId: 'private-movie' },
    };
    const slot = { mode, video: { ...createBookendVideoPresentation(5), assetId: shared.id } };
    const presets = { intro: slot, outro: structuredClone(slot) };
    const original = createVideoProject({ assets: [shared], version: 25, bookendPresets: presets });
    const held = createVideoProject({
      assets: [structuredClone(shared)],
      version: 25,
      id: 'held',
      bookendPresets: structuredClone(presets),
    });
    const before = structuredClone(held);
    const detached = { ...original, assets: [] };
    delete detached.bookendPresets;
    projectsDbMocks.txGetMock.mockResolvedValue(createVideoProjectEntry(original));
    projectsDbMocks.txGetAllMock.mockResolvedValue([
      createVideoProjectEntry(original),
      createVideoProjectEntry(held, { id: held.id }),
    ]);
    await saveVideoProject(detached);
    expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalledWith('private-movie');
    expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalledWith('project-asset:private-movie');
    expect(held).toEqual(before);
  }
);

it('saves schema26 joins and recipes without changing source data', async () => {
  const { createVideoProjectEntryWithMediaClip } = await import('./index.test-support');
  const { createVideoProjectBookendPresets } =
    await import('../../../features/video/project/scene/bookend-presets');
  const entry = createVideoProjectEntryWithMediaClip();
  const project = structuredClone(entry.project);
  project.version = 26;
  project.bookendPresets = {
    ...createVideoProjectBookendPresets(),
    introTransition: { type: 'dissolve', before: 0.2, after: 0.3 },
  };
  project.compositionJoins = [
    {
      id: 'saved',
      clipId: project.clips[0]!.id,
      edge: 'end',
      transition: { type: 'fade-black', before: 0.1, after: 0.3, color: '#123456' },
    },
  ];
  const before = structuredClone(project);
  projectsDbMocks.txGetMock.mockImplementation(async (key: string) =>
    key === entry.id ? entry : undefined
  );
  await saveVideoProject(project);
  expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({
      project: expect.objectContaining({
        version: 26,
        compositionJoins: before.compositionJoins,
        bookendPresets: before.bookendPresets,
        clips: before.clips,
        assets: before.assets,
      }),
    })
  );
  expect(project).toEqual(before);
  expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalled();
});

it('commits and reopens dormant source audio documents through the canonical root writer', async () => {
  const { commitVideoProjectWorkspaceMutation } = await import('./index-mutations');
  const { parseHydratableVideoProject } =
    await import('../../../features/video/project/validation/root');
  const asset = createProjectOwnedVideoAsset('source-envelope');
  const project = createVideoProject({
    version: 28,
    assets: [asset],
    clips: [],
    sourceAudioDocuments: [
      {
        id: 'envelope',
        binding: { kind: 'source', assetId: asset.id, sourceInstanceId: 'dormant' },
        ranges: [{ id: 'gain', start: 0, end: 1, volume: 2 }],
        mutes: [{ id: 'mute', start: 0.25, end: 0.75, volume: 0.125 }],
      },
    ],
  });
  projectsDbMocks.txGetMock.mockImplementation(async (id: string) =>
    id === asset.id
      ? { id: asset.id, assetId: 'source-bytes', mimeType: 'video/mp4', size: 20, createdAt: 100 }
      : undefined
  );
  const saved = await commitVideoProjectWorkspaceMutation(project, {
    expectedWorkspaceRevision: null,
    expectedProject: null,
  });
  expect(saved.workspaceRevision).toBe(1);
  expect(
    parseHydratableVideoProject(JSON.parse(JSON.stringify(saved.project)))?.sourceAudioDocuments
  ).toEqual(project.sourceAudioDocuments);
  expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({
      project: expect.objectContaining({
        version: 28,
        sourceAudioDocuments: project.sourceAudioDocuments,
      }),
    })
  );
});

it('commits dormant source voice takes and rejects stale retry without losing resources', async () => {
  const { commitVideoProjectWorkspaceMutation } = await import('./index-mutations');
  const { parseVideoProjectEntry } = await import('./read-guards');
  const { createVideoProjectTrack } =
    await import('../../../features/video/project/factories/creation');
  const { parseHydratableVideoProject } =
    await import('../../../features/video/project/validation/root');
  const { reviewSpeechTextSignature } =
    await import('../../../features/video/review/speech-transcript');
  const source = createProjectOwnedVideoAsset('source-voice-source');
  const audio = {
    ...createProjectOwnedVideoAsset('source-voice-take'),
    type: VideoProjectAssetType.AUDIO,
  };
  const replacement = {
    ...createProjectOwnedVideoAsset('project-asset:source-voice-replacement'),
    type: VideoProjectAssetType.AUDIO,
  };
  const track = createVideoProjectTrack('Voice', 0, 'AUDIO');
  const profile = { modelId: 'speech', voiceId: 'voice', responseFormat: 'wav' as const };
  const project = createVideoProject({
    version: 31,
    assets: [source, audio, replacement],
    clips: [],
    tracks: [track],
    sourceVoiceoverDocuments: [
      {
        id: 'voice',
        enabled: false,
        trackId: track.id,
        binding: { kind: 'source', assetId: source.id, sourceInstanceId: 'dormant-instance' },
        originalAudioSourceInstanceId: 'dormant-original-audio',
        reference: [
          { kind: 'keep', rate: 1, sourceStart: 0, sourceEnd: 5, resultStart: 0, resultEnd: 5 },
        ],
        take: {
          id: 'take',
          assetId: audio.id,
          timelineStart: 0,
          sourceOffset: 0.5,
          duration: 4,
          volume: 1.5,
          muted: true,
          dormant: true,
          fadeIn: 0.25,
          fadeOut: 0.5,
          sourceAnchor: [{ start: 0, end: 4, offset: 0, duration: 4 }],
          transcript: {
            version: 1,
            phrases: [],
            replacements: [
              {
                id: 'replacement',
                assetId: replacement.id,
                start: 0,
                end: 1,
                duration: 1,
                phraseId: 'phrase',
                revision: 1,
                text: 'Accepted',
                textSignature: reviewSpeechTextSignature('Accepted', profile),
                profile,
              },
            ],
          },
        },
      },
    ],
  });
  const before = structuredClone(project);
  let head: ReturnType<typeof parseVideoProjectEntry> = null;
  projectsDbMocks.txGetMock.mockImplementation(async (id: string) => {
    if (id === project.id) return head ?? undefined;
    const asset = project.assets.find((asset) => asset.id === id);
    return asset
      ? {
          id,
          assetId: `${id}-bytes`,
          mimeType: asset.metadata.mimeType,
          size: asset.metadata.size,
          createdAt: 100,
        }
      : undefined;
  });
  projectsDbMocks.txPutMock.mockImplementation(async (value: unknown) => {
    const parsed = parseVideoProjectEntry(value);
    if (parsed) head = parsed;
  });
  const invalid = structuredClone(project);
  invalid.sourceVoiceoverDocuments![0]!.take.volume = NaN;
  await expect(
    commitVideoProjectWorkspaceMutation(invalid, {
      expectedWorkspaceRevision: null,
      expectedProject: null,
    })
  ).rejects.toThrow();
  expect(projectsDbMocks.txPutMock).not.toHaveBeenCalled();
  const saved = await commitVideoProjectWorkspaceMutation(project, {
    expectedWorkspaceRevision: null,
    expectedProject: null,
  });
  expect(saved.workspaceRevision).toBe(1);
  expect(
    parseHydratableVideoProject(JSON.parse(JSON.stringify(saved.project)))?.sourceVoiceoverDocuments
  ).toEqual(before.sourceVoiceoverDocuments);
  for (const asset of project.assets)
    expect(projectsDbMocks.txGetMock).toHaveBeenCalledWith(asset.id);
  projectsDbMocks.txPutMock.mockClear();
  await expect(
    commitVideoProjectWorkspaceMutation(project, {
      expectedWorkspaceRevision: null,
      expectedProject: null,
    })
  ).rejects.toMatchObject({ name: 'StaleVideoProjectSaveError' });
  expect(projectsDbMocks.txPutMock).not.toHaveBeenCalled();
  const retried = await commitVideoProjectWorkspaceMutation(saved.project, {
    expectedWorkspaceRevision: 1,
    expectedProject: saved.project,
  });
  expect(retried.workspaceRevision).toBe(2);
  expect(retried.project.sourceVoiceoverDocuments).toEqual(before.sourceVoiceoverDocuments);
  expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalled();
  expect(
    projectsDbMocks.txPutMock.mock.calls.flat().some((entry) => entry?.kind === 'physical-delete')
  ).toBe(false);
  expect(project).toEqual(before);
});

function passiveSourceSpeech(assetId: string): ReviewOriginalSpeech {
  const profile = { modelId: 'tts', voiceId: 'voice', responseFormat: 'wav' as const };
  return {
    enabled: false,
    transcript: {
      version: 1,
      profile,
      transcriptionModelId: 'recognition-model',
      phrases: [
        {
          id: 'phrase',
          start: 1,
          end: 3,
          originalText: 'Original',
          text: 'Draft',
          revision: 2,
          alignment: 'word',
          words: [{ text: 'Original', start: 1, end: 3 }],
        },
      ],
      replacements: [
        {
          id: 'historical',
          phraseId: 'removed-phrase',
          start: 1,
          end: 3,
          duration: 1,
          assetId,
          revision: 1,
          text: 'Accepted',
          profile,
          textSignature: reviewSpeechTextSignature('Accepted', profile),
          enabled: true,
          originalVolume: 0.25,
        },
      ],
    },
  };
}

it('retains passive source speech and replacement-only resources through save reopen and retry', async () => {
  const { commitVideoProjectWorkspaceMutation } = await import('./index-mutations');
  const { parseVideoProjectEntry } = await import('./read-guards');
  const { parseHydratableVideoProject, isExportReadyVideoProject } =
    await import('../../../features/video/project/validation/root');
  const { getProjectAssetUses } = await import('../../../features/video/project/media-usage');
  const source = createProjectOwnedVideoAsset('passive-speech-source');
  const replacement = {
    ...createProjectOwnedVideoAsset('project-asset:passive-history'),
    type: VideoProjectAssetType.AUDIO,
    metadata: { ...source.metadata, width: 0, height: 0, mimeType: 'audio/wav', hasAudio: true },
  };
  const project = createVideoProject({
    version: 31,
    assets: [source, replacement],
    clips: [],
    sourceAudioDocuments: [
      {
        id: 'source-speech',
        binding: { kind: 'source', assetId: source.id, sourceInstanceId: 'missing-original-audio' },
        ranges: [],
        mutes: [],
        speech: passiveSourceSpeech(replacement.id),
      },
    ],
  });
  expect(isExportReadyVideoProject(project)).toBe(true);
  expect(getProjectAssetUses(project)).toEqual([
    { kind: 'source-audio', documentId: 'source-speech', assetId: source.id },
    { kind: 'source-audio', documentId: 'source-speech', assetId: replacement.id },
  ]);
  const before = structuredClone(project);
  let head: ReturnType<typeof parseVideoProjectEntry> = null;
  projectsDbMocks.txGetMock.mockImplementation(async (id: string) => {
    if (id === project.id) return head ?? undefined;
    const asset = project.assets.find((asset) => asset.id === id);
    return asset
      ? {
          id,
          assetId: `${id}-bytes`,
          mimeType: asset.metadata.mimeType,
          size: asset.metadata.size,
          createdAt: 100,
        }
      : undefined;
  });
  projectsDbMocks.txPutMock.mockImplementation(async (value: unknown) => {
    const parsed = parseVideoProjectEntry(value);
    if (parsed) head = parsed;
  });
  const saved = await commitVideoProjectWorkspaceMutation(project, {
    expectedWorkspaceRevision: null,
    expectedProject: null,
  });
  expect(saved.workspaceRevision).toBe(1);
  expect(
    parseHydratableVideoProject(JSON.parse(JSON.stringify(saved.project)))?.sourceAudioDocuments
  ).toEqual(before.sourceAudioDocuments);
  expect(saved.project.assets).toEqual(before.assets);
  for (const asset of project.assets)
    expect(projectsDbMocks.txGetMock).toHaveBeenCalledWith(asset.id);
  projectsDbMocks.txPutMock.mockClear();
  await expect(
    commitVideoProjectWorkspaceMutation(project, {
      expectedWorkspaceRevision: null,
      expectedProject: null,
    })
  ).rejects.toMatchObject({ name: 'StaleVideoProjectSaveError' });
  expect(projectsDbMocks.txPutMock).not.toHaveBeenCalled();
  expect(parseVideoProjectEntry(head)?.project.sourceAudioDocuments).toEqual(
    before.sourceAudioDocuments
  );
  const retried = await commitVideoProjectWorkspaceMutation(saved.project, {
    expectedWorkspaceRevision: 1,
    expectedProject: saved.project,
  });
  expect(retried.workspaceRevision).toBe(2);
  expect(retried.project.sourceAudioDocuments).toEqual(before.sourceAudioDocuments);
  expect(retried.project.assets).toEqual(before.assets);
  expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalled();
  expect(
    projectsDbMocks.txPutMock.mock.calls.flat().some((entry) => entry?.kind === 'physical-delete')
  ).toBe(false);
  expect(project).toEqual(before);
});
