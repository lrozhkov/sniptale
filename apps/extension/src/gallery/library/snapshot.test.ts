import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  readRemoteCardsMock,
  createGalleryItemsMock,
  getStorageEstimateInfoMock,
  listMediaLibraryMock,
  listMediaThumbnailIdsMock,
  listVideoProjectsMock,
  listScenarioExportRecordsMock,
  listScenarioProjectSummariesMock,
  loadSettingsMock,
  listAggregatePresentationsMock,
  backfillScenarioLibraryAssetsMock,
  cleanupDraftsMock,
  repairTemporaryProjectLifecyclesMock,
} = vi.hoisted(() => ({
  readRemoteCardsMock: vi.fn(),
  createGalleryItemsMock: vi.fn(),
  getStorageEstimateInfoMock: vi.fn(),
  listMediaLibraryMock: vi.fn(),
  listMediaThumbnailIdsMock: vi.fn(),
  listVideoProjectsMock: vi.fn(),
  listScenarioExportRecordsMock: vi.fn(),
  listScenarioProjectSummariesMock: vi.fn(),
  loadSettingsMock: vi.fn(),
  listAggregatePresentationsMock: vi.fn().mockResolvedValue([]),
  backfillScenarioLibraryAssetsMock: vi.fn().mockResolvedValue(0),
  cleanupDraftsMock: vi.fn().mockResolvedValue({ deletedCount: 0, deletedIds: [] }),
  repairTemporaryProjectLifecyclesMock: vi.fn().mockResolvedValue(0),
}));

vi.mock('../../workflows/sync-transfer/catalog-view', () => ({
  readPersistedSyncCatalogCards: readRemoteCardsMock,
}));
afterEach(() => vi.unstubAllGlobals());

vi.mock('../../composition/persistence/review-workspaces/summaries', () => ({
  listVideoWorkspaceSummaries: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../composition/persistence/library-lifecycle/project-retention', () => ({
  repairTemporaryProjectLifecycles: repairTemporaryProjectLifecyclesMock,
}));

vi.mock('../../composition/persistence/library-lifecycle/cleanup', () => ({
  cleanupDrafts: cleanupDraftsMock,
}));

vi.mock('../../composition/persistence/scenario/library-publication', () => ({
  backfillScenarioLibraryAssets: backfillScenarioLibraryAssetsMock,
}));

vi.mock('../../composition/persistence/aggregate-presentations', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../composition/persistence/aggregate-presentations')
  >()),
  listAggregatePresentations: listAggregatePresentationsMock,
}));

vi.mock('../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/settings')>()),
  loadSettings: loadSettingsMock,
}));

vi.mock('../../composition/persistence/media-library/index.library.ts', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../composition/persistence/media-library/index.library.ts')
  >()),
  listMediaLibrary: listMediaLibraryMock,
  listMediaThumbnailIds: listMediaThumbnailIdsMock,
}));

vi.mock('../../composition/persistence/projects/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/projects/index')>()),
  listVideoProjects: listVideoProjectsMock,
}));

vi.mock(
  '../../composition/persistence/scenario/store/project-records/exports',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../composition/persistence/scenario/store/project-records/exports')
    >()),
    listScenarioExportRecords: listScenarioExportRecordsMock,
  })
);

vi.mock(
  '../../composition/persistence/scenario/store/project-records/index',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../composition/persistence/scenario/store/project-records/index')
    >()),
    listScenarioProjectSummaries: listScenarioProjectSummariesMock,
  })
);

vi.mock('../../features/media-hub/storage-capacity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/media-hub/storage-capacity')>()),
  getStorageEstimateInfo: getStorageEstimateInfoMock,
}));

vi.mock('./items', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./items')>()),
  createGalleryItems: createGalleryItemsMock,
}));

import { loadGalleryLibrarySnapshot } from './snapshot';

describe('loadGalleryLibrarySnapshot', () => {
  it('loads committed gallery items without global repair or cleanup', async () => {
    const mediaItems = [{ id: 'asset-1' }];
    const scenarioProjects = [
      { id: 'project-1', name: 'Scenario', createdAt: 1, updatedAt: 2 },
      { id: 'project-2', name: 'Other', createdAt: 3, updatedAt: 4 },
    ];
    const scenarioExports = [
      { id: 'export-1', projectId: 'project-1' },
      { id: 'export-2', projectId: 'project-2' },
    ];
    const videoProjects = [{ id: 'video-project-1', name: 'Video', createdAt: 3, updatedAt: 4 }];
    const thumbnailIds = ['asset-1', 'scenario:project-1'];
    const nextItems = [{ id: 'asset-1' }, { id: 'scenario:project-1' }];
    const estimate = { quota: 20, usage: 10 };

    listMediaLibraryMock.mockResolvedValue(mediaItems);
    listVideoProjectsMock.mockResolvedValue(videoProjects);
    listScenarioProjectSummariesMock.mockResolvedValue(scenarioProjects);
    listScenarioExportRecordsMock.mockImplementation(async (projectId: string) =>
      scenarioExports.filter((entry) => entry.projectId === projectId)
    );
    listMediaThumbnailIdsMock.mockResolvedValue(thumbnailIds);
    getStorageEstimateInfoMock.mockResolvedValue(estimate);
    createGalleryItemsMock.mockReturnValue(nextItems);
    loadSettingsMock.mockResolvedValue({
      localStoragePolicy: {
        cleanupEnabled: true,
        defaultDestination: 'temporary',
        draftRetentionDays: 30,
        videoDraftRetentionDays: 7,
      },
    });

    const snapshot = await loadGalleryLibrarySnapshot();
    expect(snapshot.nextItems).toEqual(nextItems);
    await expect(snapshot.estimate).resolves.toEqual(estimate);
    expect(repairTemporaryProjectLifecyclesMock).not.toHaveBeenCalled();
    expect(backfillScenarioLibraryAssetsMock).not.toHaveBeenCalled();
    expect(cleanupDraftsMock).not.toHaveBeenCalled();
    expect(listMediaLibraryMock).toHaveBeenCalledTimes(1);
    expect(listVideoProjectsMock).toHaveBeenCalledTimes(1);
    expect(listScenarioProjectSummariesMock).toHaveBeenCalledTimes(1);
    expect(listScenarioExportRecordsMock).toHaveBeenCalledWith('project-1');
    expect(listScenarioExportRecordsMock).toHaveBeenCalledWith('project-2');
    expect(listMediaThumbnailIdsMock).toHaveBeenCalledTimes(1);
    expect(getStorageEstimateInfoMock).toHaveBeenCalledTimes(1);
    expect(createGalleryItemsMock).toHaveBeenCalledWith({
      mediaItems,
      presentations: [],
      quickEditProjects: [],
      scenarioExportsByProjectId: new Map([
        ['project-1', [scenarioExports[0]]],
        ['project-2', [scenarioExports[1]]],
      ]),
      scenarioProjects,
      thumbnailIds: new Set(thumbnailIds),
      videoProjects,
    });
  });

  it('computes separate expiration dates for ordinary and recording drafts', async () => {
    listMediaLibraryMock.mockResolvedValue([]);
    listVideoProjectsMock.mockResolvedValue([]);
    listScenarioProjectSummariesMock.mockResolvedValue([]);
    listMediaThumbnailIdsMock.mockResolvedValue([]);
    getStorageEstimateInfoMock.mockResolvedValue({ quota: 100, usage: 20 });
    loadSettingsMock.mockResolvedValue({
      localStoragePolicy: {
        cleanupEnabled: true,
        defaultDestination: 'temporary',
        draftRetentionDays: 30,
        videoDraftRetentionDays: 7,
      },
    });
    createGalleryItemsMock.mockReturnValue([
      {
        id: 'image-1',
        lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 1_000 },
        source: { kind: 'screenshot' },
        type: 'media',
      },
      {
        id: 'video-1',
        lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 2_000 },
        source: { kind: 'recording', recordingId: 'recording-1' },
        type: 'media',
      },
      {
        id: 'library-1',
        lifecycle: { savedAt: 3_000, storageClass: 'library', updatedAt: 3_000 },
        source: { kind: 'screenshot' },
        type: 'media',
      },
    ]);

    const result = await loadGalleryLibrarySnapshot();
    expect(result.nextItems).toEqual([
      expect.objectContaining({ expiresAt: 1_000 + 30 * 24 * 60 * 60 * 1_000 }),
      expect.objectContaining({ expiresAt: 2_000 + 7 * 24 * 60 * 60 * 1_000 }),
      expect.objectContaining({ id: 'library-1' }),
    ]);
  });

  it('does not delete drafts under default retention when settings cannot be read', async () => {
    cleanupDraftsMock.mockClear();
    repairTemporaryProjectLifecyclesMock.mockClear();
    loadSettingsMock.mockRejectedValueOnce(new Error('settings unavailable'));
    listMediaLibraryMock.mockResolvedValue([]);
    listVideoProjectsMock.mockResolvedValue([]);
    listScenarioProjectSummariesMock.mockResolvedValue([]);
    listMediaThumbnailIdsMock.mockResolvedValue([]);
    getStorageEstimateInfoMock.mockResolvedValue({ quota: 100, usage: 20 });
    createGalleryItemsMock.mockReturnValue([]);

    await expect(loadGalleryLibrarySnapshot()).resolves.toMatchObject({ nextItems: [] });
    expect(repairTemporaryProjectLifecyclesMock).not.toHaveBeenCalled();
    expect(cleanupDraftsMock).not.toHaveBeenCalled();
  });

  it('lists committed projects independently of unavailable lifecycle maintenance', async () => {
    listVideoProjectsMock.mockClear();
    repairTemporaryProjectLifecyclesMock.mockRejectedValueOnce(new Error('repair unavailable'));
    await expect(loadGalleryLibrarySnapshot()).resolves.toHaveProperty('nextItems');
    expect(listVideoProjectsMock).toHaveBeenCalled();
  });

  it('still shows library items when draft maintenance is blocked by an image journal', async () => {
    const mediaItems = [{ id: 'image-1' }];
    const nextItems = [{ id: 'image-1' }];
    loadSettingsMock.mockResolvedValueOnce({
      localStoragePolicy: {
        cleanupEnabled: true,
        defaultDestination: 'temporary',
        draftRetentionDays: 30,
        videoDraftRetentionDays: 7,
      },
    });
    cleanupDraftsMock.mockRejectedValueOnce(new Error('image journal collision'));
    listMediaLibraryMock.mockResolvedValue(mediaItems);
    listVideoProjectsMock.mockResolvedValue([]);
    listScenarioProjectSummariesMock.mockResolvedValue([]);
    listMediaThumbnailIdsMock.mockResolvedValue([]);
    getStorageEstimateInfoMock.mockResolvedValue({ quota: 100, usage: 20 });
    createGalleryItemsMock.mockReturnValue(nextItems);

    await expect(loadGalleryLibrarySnapshot()).resolves.toMatchObject({ nextItems });
    expect(listMediaLibraryMock).toHaveBeenCalledWith();
  });
});

it('returns library items while the storage estimate remains pending', async () => {
  getStorageEstimateInfoMock.mockReturnValueOnce(new Promise(() => undefined));
  const snapshot = await loadGalleryLibrarySnapshot();
  expect(snapshot.nextItems).toBeDefined();
});

it('loads one remote display snapshot and preserves native items when the remote cache fails', async () => {
  vi.stubGlobal('__SNIPTALE_SECURITY_E2E__', true);
  createGalleryItemsMock.mockReturnValue([]);
  listScenarioProjectSummariesMock.mockResolvedValue([]);
  readRemoteCardsMock.mockResolvedValueOnce([
    {
      source: 'remote',
      label: 'Remote',
      tags: [],
      kind: 'image',
      mimeType: 'image/png',
      size: 10,
      createdAt: 1,
      updatedAt: 2,
      conflict: false,
      unavailable: false,
      deleted: false,
      selection: {
        rootKind: 'media',
        rootId: 'remote',
        operationId: 'operation',
        sourceDigest: 'a'.repeat(64),
      },
    },
  ]);
  const snapshot = await loadGalleryLibrarySnapshot();
  expect(snapshot.nextItems).toHaveLength(1);
  expect(snapshot.nextItems[0]?.type).toBe('remote-root');
  expect(readRemoteCardsMock).toHaveBeenCalledWith();
  readRemoteCardsMock.mockRejectedValueOnce(new Error('cache failure'));
  await expect(loadGalleryLibrarySnapshot()).resolves.toMatchObject({
    nextItems: [],
    remoteUnavailable: true,
  });
});

it('merges only an exactly materialized remote root with its existing native Library item', async () => {
  vi.stubGlobal('__SNIPTALE_SECURITY_E2E__', true);
  const local = { type: 'media', id: 'local-root', entityId: 'root', filename: 'Shared title' };
  const card = {
    source: 'remote',
    label: 'Shared title',
    tags: [],
    kind: 'image',
    mimeType: 'image/png',
    size: 10,
    createdAt: 1,
    updatedAt: 2,
    conflict: false,
    unavailable: false,
    deleted: false,
    materialized: true,
    selection: {
      rootKind: 'media',
      rootId: 'root',
      operationId: 'operation',
      sourceDigest: 'a'.repeat(64),
    },
  };
  createGalleryItemsMock.mockReturnValue([local]);
  listScenarioProjectSummariesMock.mockResolvedValue([]);
  readRemoteCardsMock.mockResolvedValueOnce([card]);
  expect((await loadGalleryLibrarySnapshot()).nextItems).toEqual([local]);

  readRemoteCardsMock.mockResolvedValueOnce([{ ...card, materialized: undefined }]);
  expect((await loadGalleryLibrarySnapshot()).nextItems).toHaveLength(2);

  readRemoteCardsMock.mockResolvedValueOnce([
    { ...card, selection: { ...card.selection, rootKind: 'video-review' } },
  ]);
  expect((await loadGalleryLibrarySnapshot()).nextItems).toHaveLength(2);

  createGalleryItemsMock.mockReturnValue([]);
  readRemoteCardsMock.mockResolvedValueOnce([card]);
  expect((await loadGalleryLibrarySnapshot()).nextItems).toHaveLength(1);
});
