import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  createReviewWorkspaceStoreFixture,
  replaceLegacyWorkspaceFixture,
} from '../review-workspaces/store.test-support';
import {
  createProjectExportEntry,
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

vi.mock('../assets/opfs-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assets/opfs-store')>()),
  listReadyJournals: async () => [],
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

it.each([
  'advanced-edit',
  'missing-workspace',
  'recreated-workspace',
  'restored-content',
  'missing-media',
  'changed-physical-source',
  'missing-export-source',
] as const)(
  'refuses Gallery transfer after %s during actual publication preparation and permits a fresh retry',
  async (change) => {
    vi.resetModules();
    const fixture = createReviewWorkspaceStoreFixture(() => false);
    const writes: { store: string; kind: 'put' | 'delete' }[] = [];
    const transactions: { stores: string[]; mode: string }[] = [];
    projectsDbMocks.initDBMock.mockResolvedValue({
      transaction: (stores: string[], mode: string) => {
        transactions.push({ stores, mode });
        const tx = fixture.database.transaction(stores, mode);
        return {
          abort: () => tx.abort(),
          objectStore: (name: string) => {
            const store = tx.objectStore(name);
            return {
              ...store,
              put: async (value: unknown) => {
                writes.push({ store: name, kind: 'put' });
                await store.put(value);
              },
              delete: async (key: IDBValidKey) => {
                writes.push({ store: name, kind: 'delete' });
                await store.delete(key);
              },
            };
          },
          get done() {
            return tx.done;
          },
        };
      },
    });
    const { openVideoWorkspace, readVideoWorkspace, saveVideoWorkspaceAdvanced } =
      await import('../review-workspaces/store');
    const { commitVideoProjectMutation } = await import('./index-mutations');
    const id =
      change === 'missing-export-source'
        ? 'project-export:gallery-primary-export'
        : 'recording:beta-v1-recording';
    const source = { duration: 12, width: 640, height: 360, mimeType: 'video/webm', size: 15 };
    const primaryExport = createProjectExportEntry({
      ...source,
      id: 'gallery-primary-export',
      projectId: 'export-origin',
      assetId: 'export-primary-bytes',
      filename: 'Export.webm',
      createdAt: 1,
      fps: 30,
    });
    if (change === 'missing-export-source') {
      const media = fixture.rows.get('media_library')!.get('recording:beta-v1-recording');
      if (!isRecord(media)) throw new Error('Missing media fixture');
      fixture.rows.get('media_library')!.set(id, {
        ...media,
        id,
        kind: 'export',
        source: {
          kind: 'project-export',
          exportId: primaryExport.id,
          projectId: primaryExport.projectId,
        },
      });
      fixture.rows.get('project_exports')!.set(primaryExport.id, primaryExport);
    }
    await openVideoWorkspace(id, source);
    const captured = await readVideoWorkspace(id);
    if (!captured) throw new Error('Missing Gallery workspace');
    const expected = structuredClone(captured.workspace);
    const media = structuredClone(fixture.rows.get('media_library')!.get(id));
    const recording = structuredClone(fixture.rows.get('recordings')!.get('beta-v1-recording'));
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
    const destination = createVideoProject({ id: 'gallery-transfer' });
    const options = { expectedWorkspaceRevision: null, expectedReviewWorkspace: expected };
    const pending = commitVideoProjectMutation(destination, options);
    await started;
    if (change === 'advanced-edit' || change === 'restored-content') {
      const changed = await saveVideoWorkspaceAdvanced({
        aggregateId: id,
        expectedRevision: expected.revision,
        expectedSourceAssetId: expected.sourceAssetId,
        advanced: {
          ...expected.advanced,
          audio: {
            ...expected.advanced.audio,
            original: { ...expected.advanced.audio.original, volume: 0.5 },
          },
        },
      });
      if (change === 'restored-content') {
        replaceLegacyWorkspaceFixture(fixture.rows, id, {
          ...changed.workspace,
          revision: expected.revision,
          createdAt: expected.createdAt,
          updatedAt: expected.updatedAt,
        });
        const restored = await readVideoWorkspace(id);
        expect(restored?.workspace.revision).toBe(expected.revision);
        expect(restored?.workspace.createdAt).toBe(expected.createdAt);
        expect(restored?.workspace.advanced.audio.original.volume).toBe(0.5);
      }
    }
    if (change === 'missing-workspace') fixture.rows.get('video_workspaces')!.delete(id);
    if (change === 'recreated-workspace') {
      fixture.rows.get('video_workspaces')!.delete(id);
      replaceLegacyWorkspaceFixture(fixture.rows, id, {
        ...expected,
        createdAt: expected.createdAt + 1,
      });
    }
    if (change === 'missing-media') fixture.rows.get('media_library')!.delete(id);
    if (change === 'missing-export-source')
      fixture.rows.get('project_exports')!.delete(primaryExport.id);
    if (change === 'changed-physical-source') {
      if (!isRecord(recording)) throw new Error('Missing physical source fixture');
      fixture.rows.get('recordings')!.set('beta-v1-recording', {
        ...recording,
        assetId: 'replaced-physical-bytes',
      });
    }
    const sourceRows = structuredClone(fixture.rows);
    writes.length = 0;
    transactions.length = 0;
    projectsDbMocks.publishMediaHubLibraryChangedMock.mockClear();
    release();
    await expect(pending).rejects.toMatchObject({ name: 'VideoWorkspaceError' });
    expect(writes).toEqual([]);
    expect(fixture.rows).toEqual(sourceRows);
    expect(fixture.rows.get('video_projects')!.has(destination.id)).toBe(false);
    expect(projectsDbMocks.publishMediaHubLibraryChangedMock).not.toHaveBeenCalled();
    expect(
      transactions.some(
        ({ stores, mode }) =>
          mode === 'readwrite' &&
          stores.includes('video_workspaces') &&
          stores.includes('video_projects') &&
          stores.includes('project_exports')
      )
    ).toBe(true);
    fixture.rows.get('media_library')!.set(id, media);
    fixture.rows.get('recordings')!.set('beta-v1-recording', recording);
    if (change === 'missing-export-source')
      fixture.rows.get('project_exports')!.set(primaryExport.id, primaryExport);
    if (change !== 'advanced-edit' && change !== 'restored-content')
      replaceLegacyWorkspaceFixture(fixture.rows, id, expected);
    const current = await readVideoWorkspace(id);
    if (!current) throw new Error('Missing accepted retry source');
    const retrySource = structuredClone(current.workspace);
    const retryOptions = {
      expectedWorkspaceRevision: null,
      expectedReviewWorkspace: retrySource,
    };
    await expect(commitVideoProjectMutation(destination, retryOptions)).resolves.toMatchObject({
      id: destination.id,
    });
    expect(await readVideoWorkspace(id)).toEqual(current);
    expect(fixture.rows.get('video_projects')!.get(destination.id)).toMatchObject({
      workspaceRevision: 1,
      project: { id: destination.id },
    });
    expect(projectsDbMocks.publishMediaHubLibraryChangedMock).toHaveBeenCalledExactlyOnceWith(
      'create',
      ['video-project:gallery-transfer']
    );
  }
);

async function convertedGalleryImageFixture(backgroundMode: 'active' | 'remembered' = 'active') {
  const fixture = createReviewWorkspaceStoreFixture(() => false);
  fixture.rows.set('project_export_inputs', new Map());
  projectsDbMocks.initDBMock.mockResolvedValue({
    ...fixture.database,
    get: async (store: string, id: string) => fixture.rows.get(store)?.get(id),
  });
  const { openVideoWorkspace, saveVideoWorkspaceAdvanced } =
    await import('../review-workspaces/store');
  const { createVideoProjectFromRecording } =
    await import('../../../features/video/project/factories/creation');
  const { createQuickEditWatermark } =
    await import('../../../features/video/project/scene/watermark');
  const { planReviewProjectConversion } =
    await import('../../../features/video/review/project-conversion');
  const { replayReviewHistory, reviewDocumentBaseline } =
    await import('../../../features/video/review/document');
  const id = 'recording:beta-v1-recording';
  const source = { duration: 12, width: 640, height: 360, mimeType: 'video/webm', size: 15 };
  const opened = await openVideoWorkspace(id, source);
  const imageAssets = ['background', 'logo'].map((name) => {
    const physical = `gallery-${name}`;
    fixture.rows.get('project_assets')!.set(physical, {
      id: physical,
      assetId: `${physical}-bytes`,
      createdAt: 1,
      mimeType: 'image/png',
      size: 3,
    });
    fixture.rows.get('asset_refs')!.set(`${physical}-bytes`, {
      assetId: `${physical}-bytes`,
      createdAt: 1,
      mimeType: 'image/png',
      size: 3,
      sha256: null,
      location: { kind: 'opfs', objectKey: `objects/${physical}-bytes` },
    });
    fixture.rows.get('asset_owners')!.set(JSON.stringify(['project-asset', physical, 'body']), {
      assetId: `${physical}-bytes`,
      ownerKind: 'project-asset',
      ownerId: physical,
      role: 'body',
    });
    return {
      reviewAssetId: `project-asset:${physical}`,
      asset: {
        id: `native-${name}`,
        name: `${name}.png`,
        createdAt: 1,
        type: 'IMAGE' as const,
        source: { kind: 'project-asset' as const, projectAssetId: physical },
        metadata: {
          width: 80,
          height: 40,
          duration: null,
          mimeType: 'image/png',
          size: 3,
          hasAudio: false,
          audioPeaks: null,
        },
      },
    };
  });
  const captured = await saveVideoWorkspaceAdvanced({
    aggregateId: id,
    expectedRevision: opened.workspace.revision,
    expectedSourceAssetId: opened.workspace.sourceAssetId,
    advanced: {
      ...opened.workspace.advanced,
      ui: { ...opened.workspace.advanced.ui, mode: 'advanced' },
      background:
        backgroundMode === 'active'
          ? {
              enabled: true,
              type: 'image',
              assetId: 'project-asset:gallery-background',
              imageFit: 'cover',
              zoomBehavior: 'window',
              layout: { padding: 20, cornerRadius: 10 },
            }
          : {
              enabled: false,
              rememberedImage: { assetId: 'project-asset:gallery-background', imageFit: 'contain' },
            },
      watermark: {
        ...createQuickEditWatermark('Retained logo'),
        mode: 'none',
        image: {
          assetId: 'project-asset:gallery-logo',
          width: 80,
          height: 40,
          size: 0.2,
          opacity: 0.5,
        },
      },
    },
  });
  const document = replayReviewHistory(
    captured.workspace.history,
    captured.workspace.cursor,
    captured.workspace.source,
    reviewDocumentBaseline(captured.workspace)
  );
  const convert = (projectId: string) => {
    const seed = createVideoProjectFromRecording({
      ...source,
      recordingId: 'beta-v1-recording',
      filename: 'Source.webm',
      hasAudio: false,
    });
    seed.id = projectId;
    const result = planReviewProjectConversion({
      seed,
      name: projectId,
      source,
      document,
      ui: captured.workspace.advanced.ui,
      imageAssets,
    });
    if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
    return result.project;
  };
  return { ...fixture, id, captured, convert };
}

it.each(['active', 'remembered'] as const)(
  'keeps transferred %s background and inactive logo bytes after Gallery purge ' +
    'and deletion of one parallel destination',
  async (backgroundMode) => {
    vi.resetModules();
    const fixture = await convertedGalleryImageFixture(backgroundMode);
    const { commitVideoProjectMutation } = await import('./index-mutations');
    const { deleteVideoProject, getProjectAsset, getVideoProject } = await import('./index');
    const { deleteVideoWorkspaceProject } = await import('../review-workspaces/project-commands');
    const { releaseExpiredPrivateSources } = await import('../assets/private-source-retention');
    const { parsePhysicalDeleteAssetOperation, parseAssetOwner, parseAssetRef } =
      await import('../assets/guards');
    const images = ['gallery-background', 'gallery-logo'];
    const roots = [fixture.convert('transferred-1'), fixture.convert('transferred-2')];
    const options = {
      expectedWorkspaceRevision: null,
      expectedReviewWorkspace: fixture.captured.workspace,
    };
    const gates = roots.map(() => {
      let enter!: () => void;
      let release!: () => void;
      const entered = new Promise<void>((resolve) => {
        enter = resolve;
      });
      const hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      projectsDbMocks.recoverProjectMediaPublicationsMock.mockImplementationOnce(async () => {
        enter();
        await hold;
      });
      return { entered, release };
    });
    const pending = roots.map((root) => commitVideoProjectMutation(root, options));
    await Promise.all(gates.map((gate) => gate.entered));
    // IndexedDB serializes write transactions; this snapshot fixture needs that ordering explicitly.
    gates[0]!.release();
    await pending[0];
    gates[1]!.release();
    await pending[1];
    expect(fixture.rows.get('video_projects')!.size).toBe(2);
    for (const root of roots) {
      const saved = await getVideoProject(root.id);
      if (saved.status !== 'ready') throw new Error('Converted root did not reopen');
      expect(saved.project.sceneBackground).toMatchObject(
        backgroundMode === 'active'
          ? { kind: 'image', assetId: 'native-background' }
          : { kind: 'solid', remembered: { image: { assetId: 'native-background' } } }
      );
      expect(saved.project.watermark).toMatchObject({
        mode: 'none',
        image: { assetId: 'project-asset:native-logo' },
      });
    }
    await deleteVideoWorkspaceProject(fixture.id, fixture.captured.workspace.revision);
    expect(fixture.rows.get('video_workspaces')!.has(fixture.id)).toBe(false);
    const owners = [...fixture.rows.get('asset_owners')!.values()]
      .map(parseAssetOwner)
      .filter((entry) => entry !== null);
    const refs = [...fixture.rows.get('asset_refs')!.values()]
      .map(parseAssetRef)
      .filter((entry) => entry !== null);
    expect(owners).toHaveLength(2);
    expect(refs).toHaveLength(2);
    const authority = {
      authorityValid: true,
      archiveSessions: [],
      embeddedBinaryMetadata: [],
      expectedOwnerAssets: new Map<string, string>(),
      expectedOwners: owners,
      owners,
      operationIds: new Set<string>(),
      protectedRollbackAssetIds: new Set<string>(),
      publishedProjectAssetIds: new Set<string>(),
      refs,
    };
    const operations = [...fixture.rows.get('asset_operations')!.values()];
    expect(operations).toHaveLength(1);
    for (const raw of operations) {
      const operation = parsePhysicalDeleteAssetOperation(raw);
      if (!operation) throw new Error('Invalid retirement fixture');
      const retained = await releaseExpiredPrivateSources(operation, authority, []);
      expect(retained.assetIds).toEqual([]);
      expect(retained.privateSources?.map((entry) => entry.projectAssetId).sort()).toEqual(images);
    }
    await expect(deleteVideoProject(roots[0]!.id)).resolves.toEqual([]);
    expect(fixture.rows.get('video_projects')!.has(roots[1]!.id)).toBe(true);
    const assets = await import('../assets');
    const read = vi
      .spyOn(assets, 'readAssetFile')
      .mockImplementation(
        async (_ref, name) => new File(['png'], `${name}.png`, { type: 'image/png' })
      );
    try {
      for (const image of images) {
        await expect(getProjectAsset(image)).resolves.toMatchObject({
          status: 'ready',
          entry: { id: image, assetId: `${image}-bytes` },
        });
        expect(
          fixture.rows.get('asset_owners')!.get(JSON.stringify(['project-asset', image, 'body']))
        ).toMatchObject({ assetId: `${image}-bytes` });
      }
      expect(read).toHaveBeenCalledTimes(2);
    } finally {
      read.mockRestore();
    }
    await expect(deleteVideoProject(roots[1]!.id)).resolves.toEqual(images);
    for (const image of images) expect(fixture.rows.get('project_assets')!.has(image)).toBe(false);
  }
);

it.each(['image-row-missing', 'gallery-project-purged'] as const)(
  'refuses a transferred image root after %s during actual commit preparation without partial writes',
  async (change) => {
    vi.resetModules();
    const fixture = await convertedGalleryImageFixture();
    const { commitVideoProjectMutation } = await import('./index-mutations');
    const { deleteVideoWorkspaceProject } = await import('../review-workspaces/project-commands');
    const destination = fixture.convert('late-image-transfer');
    let enter!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    projectsDbMocks.recoverProjectMediaPublicationsMock.mockImplementationOnce(async () => {
      enter();
      await hold;
    });
    const pending = commitVideoProjectMutation(destination, {
      expectedWorkspaceRevision: null,
      expectedReviewWorkspace: fixture.captured.workspace,
    });
    await started;
    if (change === 'image-row-missing') fixture.rows.get('project_assets')!.delete('gallery-logo');
    else await deleteVideoWorkspaceProject(fixture.id, fixture.captured.workspace.revision);
    const before = structuredClone(fixture.rows);
    projectsDbMocks.publishMediaHubLibraryChangedMock.mockClear();
    release();
    await expect(pending).rejects.toThrow();
    expect(fixture.rows).toEqual(before);
    expect(fixture.rows.get('video_projects')!.has(destination.id)).toBe(false);
    expect(projectsDbMocks.publishMediaHubLibraryChangedMock).not.toHaveBeenCalled();
  }
);
