import { beforeEach, expect, it, vi } from 'vitest';
import { VideoProjectAssetType } from '../../../features/video/project/types/index';
import { createMediaLibraryEntry, createVideoProjectEntry } from './index.test-support.ts';

const deleteMocks = vi.hoisted(() => ({
  createProjectAssetMediaIdMock: vi.fn(),
  initDBMock: vi.fn(),
  presentationDeleteMock: vi.fn(),
  txDeleteMock: vi.fn(),
  txGetAllMock: vi.fn(),
  txGetMock: vi.fn(),
  recoverProjectMediaPublicationsMock: vi.fn(),
  completePhysicalDeleteOperationMock: vi.fn(),
  txCountMock: vi.fn(),
  txPutMock: vi.fn(),
}));

vi.mock('./asset-publication', async (importOriginal) => ({
  ...(await importOriginal()),
  recoverProjectMediaPublications: deleteMocks.recoverProjectMediaPublicationsMock,
}));
vi.mock('../recordings/asset-publication', async (importOriginal) => ({
  ...(await importOriginal()),
  recoverRecordingAssetPublications: vi.fn(async () => 0),
}));

vi.mock('../assets', async (importOriginal) => ({
  ...(await importOriginal()),
  completePhysicalDeleteOperation: deleteMocks.completePhysicalDeleteOperationMock,
  listReadyJournals: vi.fn(async () => []),
}));

vi.mock('../infrastructure/indexed-db/core', async (importOriginal) => ({
  ...(await importOriginal()),
  AGGREGATE_PRESENTATIONS_STORE: 'aggregate_presentations',
  MEDIA_LIBRARY_STORE: 'media_library',
  PROJECT_ASSETS_STORE: 'project_assets',
  PROJECT_EXPORTS_STORE: 'project_exports',
  VIDEO_PROJECTS_STORE: 'video_projects',
  initDB: deleteMocks.initDBMock,
}));

vi.mock('../media-library/entry-mapping', async (importOriginal) => ({
  ...(await importOriginal()),
  buildProjectAssetMediaEntry: vi.fn(),
  buildProjectExportMediaEntry: vi.fn(),
  buildRecordingMediaEntry: vi.fn(),
  createProjectAssetMediaId: deleteMocks.createProjectAssetMediaIdMock,
  createRecordingMediaId: vi.fn(),
}));

vi.mock('../media-library/store', () => ({
  upsertMediaEntry: vi.fn(),
}));

vi.mock('../recordings/index', async (importOriginal) => ({
  ...(await importOriginal()),
  getRecording: vi.fn(),
}));

function createDb() {
  return {
    transaction: vi.fn(() => ({
      done: Promise.resolve(),
      objectStore: vi.fn((storeName: string) => ({
        delete:
          storeName === 'aggregate_presentations'
            ? deleteMocks.presentationDeleteMock
            : deleteMocks.txDeleteMock,
        get: deleteMocks.txGetMock,
        getAll: deleteMocks.txGetAllMock,
        index: vi.fn(() => ({ count: deleteMocks.txCountMock })),
        put: deleteMocks.txPutMock,
      })),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  deleteMocks.initDBMock.mockResolvedValue(createDb());
  deleteMocks.createProjectAssetMediaIdMock.mockImplementation(
    (id: string) => `project-asset:${id}`
  );
  deleteMocks.txGetAllMock.mockResolvedValue([]);
  deleteMocks.recoverProjectMediaPublicationsMock.mockResolvedValue(undefined);
  deleteMocks.completePhysicalDeleteOperationMock.mockResolvedValue(undefined);
  deleteMocks.txCountMock.mockResolvedValue(0);
});

it('deletes project-owned assets and mirrored media entries when removing a project', async () => {
  const { deleteVideoProject } = await import('./index');

  deleteMocks.txGetMock.mockImplementation(async (key: string) =>
    key === 'project-1'
      ? createVideoProjectEntry({
          assets: [
            {
              createdAt: 1,
              id: 'asset-1',
              metadata: {
                audioPeaks: null,
                duration: 4,
                hasAudio: false,
                height: 720,
                mimeType: 'video/mp4',
                size: 10,
                width: 1280,
              },
              name: 'Project asset',
              source: { kind: 'project-asset', projectAssetId: 'asset-1' },
              type: VideoProjectAssetType.VIDEO,
            },
          ],
        })
      : key === 'asset-1'
        ? { id: 'asset-1', assetId: 'object-1', createdAt: 1, mimeType: 'video/mp4', size: 10 }
        : undefined
  );

  await deleteVideoProject('project-1');

  expect(deleteMocks.txDeleteMock).toHaveBeenNthCalledWith(1, 'project-1');
  expect(deleteMocks.txDeleteMock).toHaveBeenCalledWith('asset-1');
  expect(deleteMocks.txDeleteMock).toHaveBeenCalledWith('project-asset:asset-1');
  expect(deleteMocks.presentationDeleteMock).toHaveBeenCalledWith(['video-project', 'project-1']);
});

it('preserves shared project-owned assets when another project still references them', async () => {
  const { deleteVideoProject } = await import('./index');
  const sharedAsset = {
    createdAt: 1,
    id: 'asset-shared',
    metadata: {
      audioPeaks: null,
      duration: 4,
      hasAudio: false,
      height: 720,
      mimeType: 'video/mp4',
      size: 10,
      width: 1280,
    },
    name: 'Shared project asset',
    source: { kind: 'project-asset' as const, projectAssetId: 'asset-shared' },
    type: VideoProjectAssetType.VIDEO,
  };

  deleteMocks.txGetMock.mockResolvedValue(createVideoProjectEntry({ assets: [sharedAsset] }));
  deleteMocks.txGetAllMock.mockResolvedValue([
    createVideoProjectEntry({ assets: [sharedAsset] }),
    createVideoProjectEntry({ assets: [sharedAsset], id: 'project-2' }, { id: 'project-2' }),
  ]);

  await deleteVideoProject('project-1');

  expect(deleteMocks.txDeleteMock).toHaveBeenCalledOnce();
  expect(deleteMocks.txDeleteMock).toHaveBeenCalledWith('project-1');
  expect(deleteMocks.presentationDeleteMock).toHaveBeenCalledWith(['video-project', 'project-1']);
  expect(deleteMocks.txDeleteMock).not.toHaveBeenCalledWith('asset-shared');
  expect(deleteMocks.txDeleteMock).not.toHaveBeenCalledWith('project-asset:asset-shared');
});

it.each(['library', 'temporary'] as const)(
  'preserves a published %s project asset when its project is deleted',
  async (storageClass) => {
    const { deleteVideoProject } = await import('./index');
    const asset = {
      createdAt: 1,
      id: 'asset-saved',
      metadata: {
        audioPeaks: null,
        duration: 4,
        hasAudio: false,
        height: 720,
        mimeType: 'video/mp4',
        size: 10,
        width: 1280,
      },
      name: 'Saved project asset',
      source: { kind: 'project-asset' as const, projectAssetId: 'asset-saved' },
      type: VideoProjectAssetType.VIDEO,
    };
    deleteMocks.txGetMock.mockImplementation(async (key: string) =>
      key === 'project-1'
        ? createVideoProjectEntry({ assets: [asset] })
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

    await deleteVideoProject('project-1');

    expect(deleteMocks.txDeleteMock).toHaveBeenCalledOnce();
    expect(deleteMocks.txDeleteMock).toHaveBeenCalledWith('project-1');
    if (storageClass === 'temporary') {
      expect(deleteMocks.txPutMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'project-asset:asset-saved',
          lifecycle: expect.objectContaining({
            storageClass: 'library',
            savedAt: expect.any(Number),
          }),
        })
      );
    } else {
      expect(deleteMocks.txPutMock).not.toHaveBeenCalledWith(
        expect.objectContaining({ id: 'project-asset:asset-saved' })
      );
    }
  }
);

it('deletes the project row when the project payload is already missing', async () => {
  const { deleteVideoProject } = await import('./index');
  deleteMocks.txGetMock.mockResolvedValue(undefined);

  await deleteVideoProject('missing-project');

  expect(deleteMocks.txDeleteMock).toHaveBeenCalledTimes(1);
  expect(deleteMocks.txDeleteMock).toHaveBeenCalledWith('missing-project');
  expect(deleteMocks.presentationDeleteMock).toHaveBeenCalledWith([
    'video-project',
    'missing-project',
  ]);
});

it('persists and completes physical deletion after removing the last asset owner', async () => {
  const { deleteVideoProject } = await import('./index');
  const project = createVideoProjectEntry({
    assets: [
      {
        createdAt: 1,
        id: 'asset-final',
        metadata: {
          audioPeaks: null,
          duration: 4,
          hasAudio: false,
          height: 720,
          mimeType: 'video/mp4',
          size: 10,
          width: 1280,
        },
        name: 'Final asset',
        source: { kind: 'project-asset', projectAssetId: 'asset-final' },
        type: VideoProjectAssetType.VIDEO,
      },
    ],
  });
  deleteMocks.txGetMock.mockImplementation(async (key: string) =>
    key === 'project-1'
      ? project
      : key === 'asset-final'
        ? {
            assetId: 'object-final',
            createdAt: 1,
            id: 'asset-final',
            mimeType: 'video/mp4',
            size: 10,
          }
        : undefined
  );

  await expect(deleteVideoProject('project-1')).resolves.toEqual(['asset-final']);

  expect(deleteMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({ assetIds: ['object-final'], kind: 'physical-delete' })
  );
  expect(deleteMocks.completePhysicalDeleteOperationMock).toHaveBeenCalledWith(
    expect.objectContaining({ assetIds: ['object-final'] })
  );
});

async function installNestedResourceGraph(failRelease = false) {
  const { createQuickEditAdvancedState } =
    await import('../../../features/video/review/advanced/defaults');
  const { createVideoProjectEntryWithMediaClip, createProjectAssetEntry } =
    await import('./index.test-support');
  const parent = createVideoProjectEntryWithMediaClip();
  parent.project.assets[0]!.source = { kind: 'project-asset', projectAssetId: 'parent' };
  const tables = new Map<string, Map<string, unknown>>();
  const table = (name: string) => {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name)!;
  };
  table('video_projects').set(parent.id, parent);
  for (const id of ['parent', 'child'])
    table('project_assets').set(id, createProjectAssetEntry({ id, assetId: `${id}-bytes` }));
  const advanced = createQuickEditAdvancedState();
  advanced.audio.music.push({
    id: 'music',
    assetId: 'project-asset:child',
    timelineStart: 0,
    sourceOffset: 0,
    duration: 1,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  });
  table('video_workspaces').set('project-asset:parent', {
    aggregateId: 'project-asset:parent',
    sourceAssetId: 'parent-bytes',
    source: { duration: 2, width: 100, height: 100, size: 5, mimeType: 'video/webm' },
    formatVersion: 1,
    revision: 1,
    history: [],
    cursor: 0,
    advanced,
    createdAt: 1,
    updatedAt: 1,
  });
  const objectStore = (name: string) => ({
    get: async (key: IDBValidKey) => table(name).get(String(key)),
    getAll: async () => [...table(name).values()],
    delete: async (key: IDBValidKey) => table(name).delete(String(key)),
    put: async (value: Record<string, unknown>) => {
      if (name === 'asset_operations' && failRelease) throw new Error('release journal failed');
      return table(name).set(String(value['id'] ?? value['aggregateId']), value);
    },
    index: () => ({ count: async () => 0 }),
  });
  deleteMocks.initDBMock.mockResolvedValue({
    get: (name: string, key: IDBValidKey) => objectStore(name).get(key),
    transaction: () => {
      const before = structuredClone(tables);
      return {
        objectStore,
        done: Promise.resolve(),
        abort: () => {
          tables.clear();
          for (const [name, rows] of before) tables.set(name, rows);
        },
      };
    },
  });
  return { parent, table };
}

it.each(['save', 'delete', 'asset', 'asset-shared', 'asset-published-shared'] as const)(
  'reclaims nested private review resources on parent %s',
  async (operation) => {
    const { saveVideoProject, deleteVideoProject, deleteProjectAsset } = await import('./index');
    const { parent, table } = await installNestedResourceGraph();
    if (operation === 'asset') table('video_projects').clear();
    if (operation === 'asset-published-shared') {
      table('media_library').set(
        'project-asset:parent',
        createMediaLibraryEntry({
          id: 'project-asset:parent',
          source: { kind: 'project-asset', projectAssetId: 'parent' },
        })
      );
      await expect(deleteProjectAsset('parent')).rejects.toThrow();
      expect(table('project_assets').size).toBe(2);
      expect(table('video_workspaces').size).toBe(1);
      expect(table('media_library').has('project-asset:parent')).toBe(true);
      expect(deleteMocks.completePhysicalDeleteOperationMock).not.toHaveBeenCalled();
      return;
    }
    if (operation === 'delete') await deleteVideoProject(parent.id);
    else if (operation === 'save')
      await saveVideoProject({ ...parent.project, assets: [], clips: [] });
    else await deleteProjectAsset('parent');
    if (operation === 'asset-shared') {
      expect(table('project_assets').size).toBe(2);
      expect(table('video_workspaces').size).toBe(1);
      expect(deleteMocks.completePhysicalDeleteOperationMock).not.toHaveBeenCalled();
      return;
    }
    expect(table('project_assets').size).toBe(0);
    expect(table('video_workspaces').size).toBe(0);
    expect(deleteMocks.completePhysicalDeleteOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({ assetIds: expect.arrayContaining(['parent-bytes', 'child-bytes']) })
    );
  }
);

it.each(['recording-shared', 'export-shared'] as const)(
  'refuses lower source deletion after project adoption: %s',
  async (operation) => {
    const { parent, table } = await installNestedResourceGraph();
    const recording = operation === 'recording-shared';
    const mediaId = `${recording ? 'recording' : 'export'}:parent`;
    parent.project.assets[0]!.source = { kind: 'library-asset', mediaId };
    table(recording ? 'recordings' : 'project_exports').set('parent', {
      id: 'parent',
      assetId: 'parent-bytes',
      createdAt: 1,
      mimeType: 'video/webm',
      size: 5,
      filename: 'source.webm',
      duration: 2,
      fps: 30,
      width: 100,
      height: 100,
      projectId: parent.id,
    });
    table('media_library').set(
      mediaId,
      createMediaLibraryEntry({
        id: mediaId,
        source: recording
          ? { kind: 'recording', recordingId: 'parent' }
          : { kind: 'project-export', exportId: 'parent', projectId: parent.id },
      })
    );
    const run = recording
      ? (await import('../recordings/index')).deleteRecording('parent')
      : (await import('./index.exports')).deleteProjectExport('parent');
    await expect(run).rejects.toThrow();
    expect(table('media_library').has(mediaId)).toBe(true);
    expect(table(recording ? 'recordings' : 'project_exports').has('parent')).toBe(true);
    expect(deleteMocks.completePhysicalDeleteOperationMock).not.toHaveBeenCalled();
  }
);

it.each(['save-failure', 'delete-failure'] as const)(
  'rolls back nested release after a journal failure: %s',
  async (operation) => {
    const { saveVideoProject, deleteVideoProject } = await import('./index');
    const { parent, table } = await installNestedResourceGraph(true);
    const names = ['video_projects', 'project_assets', 'video_workspaces'];
    const before = names.map((name) => structuredClone(table(name)));
    const run =
      operation === 'save-failure'
        ? saveVideoProject({ ...parent.project, assets: [], clips: [] })
        : deleteVideoProject(parent.id);
    await expect(run).rejects.toThrow('release journal failed');
    expect(names.map(table)).toEqual(before);
    expect(deleteMocks.completePhysicalDeleteOperationMock).not.toHaveBeenCalled();
  }
);
