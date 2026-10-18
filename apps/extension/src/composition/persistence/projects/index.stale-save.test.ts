import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import {
  createVideoProject,
  createVideoProjectEntry,
  createVideoProjectEntryWithMediaClip,
} from './index.test-support.ts';

const projectsDbMocks = vi.hoisted(() => ({
  dbGetMock: vi.fn(),
  initDBMock: vi.fn(),
  publishMediaHubLibraryChangedMock: vi.fn(),
  txDeleteMock: vi.fn(),
  txGetAllMock: vi.fn(),
  txGetMock: vi.fn(),
  txPutMock: vi.fn(),
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
  AGGREGATE_PRESENTATIONS_STORE: 'aggregate_presentations',
  MEDIA_LIBRARY_STORE: 'media_library',
  PROJECT_ASSETS_STORE: 'project_assets',
  VIDEO_PROJECTS_STORE: 'video_projects',
  initDB: projectsDbMocks.initDBMock,
}));

vi.mock('../../../features/media-hub/events', async (importOriginal) => ({
  ...(await importOriginal()),
  publishMediaHubLibraryChanged: projectsDbMocks.publishMediaHubLibraryChangedMock,
}));

vi.mock('../media-library/entry-mapping', async (importOriginal) => ({
  ...(await importOriginal()),
  createProjectAssetMediaId: (id: string) => `project-asset:${id}`,
}));

function createDb() {
  return {
    get: projectsDbMocks.dbGetMock,
    transaction: vi.fn(() => ({
      done: Promise.resolve(),
      objectStore: vi.fn(() => ({
        delete: projectsDbMocks.txDeleteMock,
        index: () => ({ count: async () => 0, getAll: async () => [], getAllKeys: async () => [] }),
        getAll: projectsDbMocks.txGetAllMock,
        get: projectsDbMocks.txGetMock,
        put: projectsDbMocks.txPutMock,
      })),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  projectsDbMocks.initDBMock.mockResolvedValue(createDb());
  projectsDbMocks.txGetAllMock.mockResolvedValue([]);
  projectsDbMocks.recoverProjectMediaPublicationsMock.mockResolvedValue(undefined);
});

beforeAll(async () => {
  await import('./index');
});

async function importProjectsDbModule() {
  vi.resetModules();
  return import('./index');
}

it('rejects stale video project saves inside the write transaction before writes or publication', async () => {
  const { saveVideoProject } = await importProjectsDbModule();
  const project = createVideoProject({ updatedAt: 10 });
  projectsDbMocks.dbGetMock.mockResolvedValue(createVideoProjectEntry({ updatedAt: 10 }));
  projectsDbMocks.txGetMock.mockResolvedValue(createVideoProjectEntry({ updatedAt: 20 }));

  await expect(saveVideoProject(project, { baseUpdatedAt: 10 })).rejects.toThrow(
    'Video project project-1 was changed before this save completed'
  );

  expect(projectsDbMocks.dbGetMock).not.toHaveBeenCalledWith('video_projects', 'project-1');
  expect(projectsDbMocks.txGetMock).toHaveBeenCalledWith('project-1');
  expect(projectsDbMocks.txPutMock).not.toHaveBeenCalled();
  expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalled();
  expect(projectsDbMocks.publishMediaHubLibraryChangedMock).not.toHaveBeenCalled();
});

it('uses the integer workspace revision as the authoritative compare-and-swap token', async () => {
  const { saveVideoProject } = await importProjectsDbModule();
  const project = createVideoProject({ updatedAt: 10 });
  projectsDbMocks.txGetMock.mockResolvedValue(
    createVideoProjectEntry({ updatedAt: 10 }, { workspaceRevision: 4 })
  );

  await expect(saveVideoProject(project, { expectedWorkspaceRevision: 3 })).rejects.toMatchObject({
    name: 'StaleVideoProjectSaveError',
  });
  expect(projectsDbMocks.txPutMock).not.toHaveBeenCalled();

  await expect(saveVideoProject(project, { expectedWorkspaceRevision: 4 })).resolves.toMatchObject({
    workspaceRevision: 5,
  });
  expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({ workspaceRevision: 5 })
  );
});

it('accepts only a null expected workspace revision when creating a project', async () => {
  const { saveVideoProject } = await importProjectsDbModule();
  const project = createVideoProject({ id: 'new-project' });
  projectsDbMocks.txGetMock.mockResolvedValue(undefined);

  await expect(saveVideoProject(project, { expectedWorkspaceRevision: 0 })).rejects.toMatchObject({
    name: 'StaleVideoProjectSaveError',
  });
  await expect(
    saveVideoProject(project, { expectedWorkspaceRevision: null })
  ).resolves.toMatchObject({ workspaceRevision: 1 });
});

it('journals detached project sources while saving without revoking mounted Undo', async () => {
  const { saveVideoProject } = await importProjectsDbModule();
  const project = createVideoProject({ updatedAt: 10 });
  projectsDbMocks.txGetMock.mockImplementation(async (key: string) =>
    key === project.id
      ? createVideoProjectEntryWithMediaClip({ updatedAt: 10 })
      : key === 'project-asset-1'
        ? {
            id: 'project-asset-1',
            assetId: 'asset-body',
            createdAt: 1,
            mimeType: 'video/mp4',
            size: 10,
          }
        : undefined
  );

  await saveVideoProject(project, { baseUpdatedAt: 10 });

  expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'project-1' })
  );
  expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalled();
  expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'physical-delete',
      assetIds: [],
      privateSources: [{ projectAssetId: 'project-asset-1', expectedAssetId: 'asset-body' }],
    })
  );
  expect(projectsDbMocks.publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('update', [
    'video-project:project-1',
  ]);
});

it('publishes a create event when saving a new video project', async () => {
  const { saveVideoProject } = await importProjectsDbModule();
  const project = createVideoProject({ id: 'project-new' });
  projectsDbMocks.txGetMock.mockResolvedValue(undefined);

  await saveVideoProject(project);

  expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'project-new' })
  );
  expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalled();
  expect(projectsDbMocks.publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('create', [
    'video-project:project-new',
  ]);
});

it('preserves persisted project-owned assets when saving an older project snapshot', async () => {
  const { saveVideoProject } = await importProjectsDbModule();
  const project = createVideoProject({ updatedAt: 10 });
  projectsDbMocks.txGetMock.mockResolvedValue(
    createVideoProjectEntryWithMediaClip({ updatedAt: 20 })
  );

  await saveVideoProject(project);

  expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({
      project: expect.objectContaining({
        assets: [expect.objectContaining({ id: expect.any(String) })],
      }),
    })
  );
  expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalled();
  expect(projectsDbMocks.publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('update', [
    'video-project:project-1',
  ]);
});

it('refuses restored metadata with an unchanged identity, revision and timestamp before writes', async () => {
  const { saveVideoProject } = await importProjectsDbModule();
  const base = createVideoProject({ updatedAt: 10 });
  const restored = createVideoProjectEntry(
    { ...base, name: 'Restored script' },
    { workspaceRevision: 4 }
  );
  projectsDbMocks.txGetMock.mockResolvedValue(restored);
  await expect(
    saveVideoProject(
      { ...base, name: 'Pending voice take' },
      {
        expectedWorkspaceRevision: 4,
        expectedProject: base,
      }
    )
  ).rejects.toMatchObject({ name: 'StaleVideoProjectSaveError' });
  expect(projectsDbMocks.txPutMock).not.toHaveBeenCalled();
  expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalled();
  expect(projectsDbMocks.publishMediaHubLibraryChangedMock).not.toHaveBeenCalled();
});

it('preserves the actual replace restore when it commits during pending Save preparation', async () => {
  const { saveVideoProject } = await importProjectsDbModule();
  const { putVideoProjectBackupRestore } = await import('./backup-restore');
  const { createVideoProjectRestoreTransaction } = await import('./index.test-support');
  const base = createVideoProject({ updatedAt: 10 });
  let head = createVideoProjectEntry(base, { workspaceRevision: 4 });
  let release!: () => void;
  let entered!: () => void;
  const pendingRecovery = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  projectsDbMocks.recoverProjectMediaPublicationsMock.mockImplementationOnce(async () => {
    entered();
    await pendingRecovery;
  });
  projectsDbMocks.txGetMock.mockImplementation(async (key: IDBValidKey) =>
    key === base.id ? head : undefined
  );
  projectsDbMocks.txPutMock.mockImplementation(async (value: unknown) => {
    const { parseVideoProjectEntry } = await import('./read-guards');
    const parsed = parseVideoProjectEntry(value);
    if (parsed) head = parsed;
  });
  const pending = saveVideoProject(
    { ...base, name: 'Pending voice take' },
    {
      expectedWorkspaceRevision: 4,
      expectedProject: base,
    }
  );
  await started;
  const empty = () => ({
    get: async (_key: IDBValidKey): Promise<unknown> => undefined,
    getAll: async (): Promise<unknown[]> => [],
    put: async (_value: unknown): Promise<unknown> => undefined,
    delete: async (_key: IDBValidKey): Promise<unknown> => undefined,
  });
  const stores = {
    assets: empty(),
    exports: { ...empty(), index: () => ({ getAll: async () => [] }) },
    media: empty(),
    videoWorkspaces: empty(),
    videoDrafts: empty(),
    operations: empty(),
    owners: { ...empty(), index: () => ({ count: async () => 0 }) },
    presentations: empty(),
    refs: empty(),
    thumbnails: empty(),
    scenarioAssets: empty(),
    projects: {
      ...empty(),
      get: async () => head,
      getAll: async () => [head],
      put: async (value: typeof head) => {
        head = value;
      },
    },
  } satisfies import('./backup-restore').VideoProjectBackupRestoreStores;
  const restored = createVideoProjectEntry(
    { ...base, name: 'Restored script' },
    { workspaceRevision: 4 }
  );
  await putVideoProjectBackupRestore({
    root: { assets: [], entry: restored, exports: [] },
    stores,
    tx: createVideoProjectRestoreTransaction(stores),
    strategy: 'replace',
    operation: {
      assetIds: [],
      createdAt: 1,
      kind: 'physical-delete',
      operationId: 'restore-cleanup',
      status: 'pending',
      updatedAt: 1,
    },
  });
  expect(head.project.name).toBe('Restored script');
  expect(head.workspaceRevision).toBe(4);
  expect(head.project.updatedAt).toBe(10);
  release();
  await expect(pending).rejects.toMatchObject({ name: 'StaleVideoProjectSaveError' });
  expect(head.project.name).toBe('Restored script');
  expect(projectsDbMocks.txPutMock).not.toHaveBeenCalled();
  expect(projectsDbMocks.publishMediaHubLibraryChangedMock).not.toHaveBeenCalled();
});

it('accepts the exact canonical predecessor and advances its revision', async () => {
  const { saveVideoProject } = await importProjectsDbModule();
  const base = createVideoProject({ updatedAt: 10 });
  projectsDbMocks.txGetMock.mockResolvedValue(
    createVideoProjectEntry(base, { workspaceRevision: 4 })
  );
  await expect(
    saveVideoProject(
      { ...base, name: 'Accepted take' },
      {
        expectedWorkspaceRevision: 4,
        expectedProject: structuredClone(base),
      }
    )
  ).resolves.toMatchObject({ project: { name: 'Accepted take' }, workspaceRevision: 5 });
});

it.each(['missing', 'recreated', 'trashed'] as const)(
  'refuses the %s predecessor before publishing a delayed edit',
  async (state) => {
    const { saveVideoProject } = await importProjectsDbModule();
    const base = createVideoProject({ updatedAt: 10 });
    const current = createVideoProjectEntry(
      { ...base, ...(state === 'recreated' ? { createdAt: base.createdAt - 1 } : {}) },
      {
        workspaceRevision: 4,
        ...(state === 'trashed'
          ? { lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 2, trashedAt: 2 } }
          : {}),
      }
    );
    projectsDbMocks.txGetMock.mockResolvedValue(state === 'missing' ? undefined : current);
    await expect(
      saveVideoProject(
        { ...base, name: 'Delayed take' },
        {
          expectedWorkspaceRevision: 4,
          expectedProject: base,
        }
      )
    ).rejects.toMatchObject({ name: 'StaleVideoProjectSaveError' });
    expect(projectsDbMocks.txPutMock).not.toHaveBeenCalled();
    expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalled();
    expect(projectsDbMocks.publishMediaHubLibraryChangedMock).not.toHaveBeenCalled();
  }
);

it('refuses a pending save after deletion and recreation of the same identity and revision', async () => {
  const { saveVideoProject } = await importProjectsDbModule();
  const base = createVideoProject({ updatedAt: 10 });
  let head: ReturnType<typeof createVideoProjectEntry> | undefined = createVideoProjectEntry(base, {
    workspaceRevision: 4,
  });
  let release!: () => void;
  let entered!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  projectsDbMocks.recoverProjectMediaPublicationsMock.mockImplementationOnce(async () => {
    entered();
    await hold;
  });
  projectsDbMocks.txGetMock.mockImplementation(async (key: IDBValidKey) =>
    key === base.id ? head : undefined
  );
  const pending = saveVideoProject(
    { ...base, name: 'Delayed take' },
    { expectedWorkspaceRevision: 4, expectedProject: base }
  );
  await started;
  head = undefined;
  expect(await projectsDbMocks.txGetMock(base.id)).toBeUndefined();
  head = createVideoProjectEntry(
    { ...base, createdAt: base.createdAt - 1, name: 'Recreated project' },
    { workspaceRevision: 4 }
  );
  release();
  await expect(pending).rejects.toMatchObject({ name: 'StaleVideoProjectSaveError' });
  expect(head.project.name).toBe('Recreated project');
  expect(projectsDbMocks.txPutMock).not.toHaveBeenCalled();
  expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalled();
  expect(projectsDbMocks.publishMediaHubLibraryChangedMock).not.toHaveBeenCalled();
});
