import { beforeEach, expect, it, vi } from 'vitest';

const { dbDeleteMock, dbGetAllFromIndexMock, dbGetMock, dbPutMock, initDBMock } = vi.hoisted(
  () => ({
    dbDeleteMock: vi.fn(),
    dbGetAllFromIndexMock: vi.fn(),
    dbGetMock: vi.fn(),
    dbPutMock: vi.fn(),
    initDBMock: vi.fn(),
  })
);

vi.mock('../../infrastructure/indexed-db/core', async () => {
  const actual = await vi.importActual<typeof import('../../infrastructure/indexed-db/core')>(
    '../../infrastructure/indexed-db/core'
  );
  return {
    ...actual,
    initDB: initDBMock,
  };
});

import {
  deletePendingScenarioAsset,
  deleteScenarioAsset,
  getPendingScenarioAsset,
  getScenarioAsset,
  listPendingScenarioAssets,
  listScenarioAssets,
  savePendingScenarioAsset,
  saveScenarioAsset,
} from './assets';

beforeEach(() => {
  vi.clearAllMocks();
  initDBMock.mockResolvedValue({
    delete: dbDeleteMock,
    get: dbGetMock,
    getAllFromIndex: dbGetAllFromIndexMock,
    put: dbPutMock,
  });
});

function createScenarioAssetRow(overrides: Record<string, unknown> = {}) {
  const blob = new Blob(['asset'], { type: 'image/png' });
  return {
    id: 'asset-1',
    projectId: 'project-1',
    galleryAssetId: null,
    blob,
    mimeType: 'image/png',
    width: 100,
    height: 50,
    createdAt: 10,
    size: blob.size,
    ...overrides,
  };
}

function createPendingScenarioAssetRow(overrides: Record<string, unknown> = {}) {
  const blob = new Blob(['pending'], { type: 'image/png' });
  return {
    id: 'pending-1',
    tabId: 9,
    galleryAssetId: null,
    blob,
    mimeType: 'image/png',
    createdAt: 11,
    size: blob.size,
    ...overrides,
  };
}

it('stores and loads scenario assets', async () => {
  const assetBlob = new Blob(['asset'], { type: 'image/png' });
  dbGetMock.mockResolvedValueOnce({
    id: 'asset-1',
    projectId: 'project-1',
    galleryAssetId: null,
    blob: assetBlob,
    mimeType: 'image/png',
    width: 100,
    height: 50,
    createdAt: 10,
    size: assetBlob.size,
  });
  dbGetAllFromIndexMock.mockResolvedValueOnce([
    {
      id: 'asset-1',
      projectId: 'project-1',
      galleryAssetId: null,
      blob: assetBlob,
      mimeType: 'image/png',
      width: 100,
      height: 50,
      createdAt: 10,
      size: assetBlob.size,
    },
  ]);

  await saveScenarioAsset({
    id: 'asset-1',
    projectId: 'project-1',
    galleryAssetId: null,
    blob: assetBlob,
    mimeType: 'image/png',
    width: 100,
    height: 50,
    createdAt: 10,
    size: assetBlob.size,
  });

  expect(dbPutMock).toHaveBeenCalledTimes(1);
  await expect(getScenarioAsset('asset-1')).resolves.toEqual(
    expect.objectContaining({ id: 'asset-1', mimeType: 'image/png' })
  );
  await expect(listScenarioAssets('project-1')).resolves.toEqual([
    expect.objectContaining({ id: 'asset-1', projectId: 'project-1' }),
  ]);
  await deleteScenarioAsset('asset-1');
  expect(dbDeleteMock).toHaveBeenCalledWith('scenario_assets', 'asset-1');
});

it('filters malformed scenario asset rows at the DB boundary', async () => {
  const assetBlob = new Blob(['asset'], { type: 'image/png' });
  dbGetMock.mockResolvedValueOnce(createScenarioAssetRow({ blob: { not: 'blob' } }));
  dbGetAllFromIndexMock.mockResolvedValueOnce([
    createScenarioAssetRow(),
    createScenarioAssetRow({
      id: 'asset-svg',
      blob: new Blob(['<svg></svg>'], { type: 'image/svg+xml' }),
      mimeType: 'image/svg+xml',
      size: 11,
    }),
    createScenarioAssetRow({
      id: 'asset-2',
      blob: assetBlob,
      width: Number.POSITIVE_INFINITY,
    }),
  ]);

  await expect(getScenarioAsset('asset-1')).resolves.toBeUndefined();
  await expect(listScenarioAssets('project-1')).resolves.toEqual([
    expect.objectContaining({ id: 'asset-1' }),
  ]);
});

it('stores and deletes pending scenario assets', async () => {
  const pendingBlob = new Blob(['pending'], { type: 'image/png' });
  dbGetMock.mockResolvedValueOnce({
    id: 'pending-1',
    tabId: 9,
    galleryAssetId: null,
    blob: pendingBlob,
    mimeType: 'image/png',
    createdAt: 11,
    size: pendingBlob.size,
  });

  await savePendingScenarioAsset({
    id: 'pending-1',
    tabId: 9,
    galleryAssetId: null,
    blob: pendingBlob,
    mimeType: 'image/png',
    createdAt: 11,
    size: pendingBlob.size,
  });

  expect(dbPutMock).toHaveBeenCalledTimes(1);
  await expect(getPendingScenarioAsset('pending-1')).resolves.toEqual(
    expect.objectContaining({ id: 'pending-1', tabId: 9 })
  );
  await deletePendingScenarioAsset('pending-1');
  expect(dbDeleteMock).toHaveBeenCalledWith('scenario_pending_assets', 'pending-1');
});

it('lists pending scenario assets for recovery cleanup', async () => {
  const pendingBlob = new Blob(['pending'], { type: 'image/png' });
  dbGetAllFromIndexMock.mockResolvedValueOnce([]);
  initDBMock.mockResolvedValueOnce({
    delete: dbDeleteMock,
    get: dbGetMock,
    getAll: vi.fn().mockResolvedValue([
      {
        id: 'pending-1',
        tabId: 9,
        galleryAssetId: null,
        blob: pendingBlob,
        mimeType: 'image/png',
        createdAt: 11,
        size: pendingBlob.size,
      },
    ]),
    getAllFromIndex: dbGetAllFromIndexMock,
    put: dbPutMock,
  });

  await expect(listPendingScenarioAssets()).resolves.toEqual([
    expect.objectContaining({ id: 'pending-1', tabId: 9 }),
  ]);
});

it('filters malformed pending scenario asset rows before recovery cleanup', async () => {
  const pendingBlob = new Blob(['pending'], { type: 'image/png' });
  dbGetMock.mockResolvedValueOnce(
    createPendingScenarioAssetRow({
      blob: new Blob(['<svg></svg>'], { type: 'image/svg+xml' }),
      mimeType: 'image/svg+xml',
      size: 11,
    })
  );

  await expect(getPendingScenarioAsset('pending-1')).resolves.toBeUndefined();
  initDBMock.mockResolvedValueOnce({
    delete: dbDeleteMock,
    get: dbGetMock,
    getAll: vi.fn().mockResolvedValue([
      createPendingScenarioAssetRow(),
      createPendingScenarioAssetRow({
        id: 'pending-2',
        tabId: 'tab-9',
        blob: pendingBlob,
      }),
      createPendingScenarioAssetRow({
        id: undefined,
        tabId: 9,
        blob: pendingBlob,
      }),
    ]),
    getAllFromIndex: dbGetAllFromIndexMock,
    put: dbPutMock,
  });
  await expect(listPendingScenarioAssets()).resolves.toEqual([
    expect.objectContaining({ id: 'pending-1', tabId: 9 }),
  ]);
});
