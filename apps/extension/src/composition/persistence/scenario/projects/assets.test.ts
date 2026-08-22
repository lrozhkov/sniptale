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

vi.mock('../../assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../assets')>()),
  parseAssetRef: (value: unknown) => value,
  readAssetFile: vi.fn(
    async (_ref, filename: string) => new File(['asset'], filename, { type: 'image/png' })
  ),
  recoverStandaloneAssetPublications: vi.fn(async () => 0),
}));

import {
  deletePendingScenarioAsset,
  getPendingScenarioAsset,
  getScenarioAsset,
  listPendingScenarioAssets,
  listScenarioAssets,
  savePendingScenarioAsset,
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
    assetId: 'opfs-asset-1',
    id: 'asset-1',
    projectId: 'project-1',
    galleryAssetId: null,
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

it('loads scenario assets through the read-only child-store seam', async () => {
  const assetBlob = new Blob(['asset'], { type: 'image/png' });
  dbGetMock
    .mockResolvedValueOnce({
      assetId: 'opfs-asset-1',
      id: 'asset-1',
      projectId: 'project-1',
      galleryAssetId: null,
      mimeType: 'image/png',
      width: 100,
      height: 50,
      createdAt: 10,
      size: assetBlob.size,
    })
    .mockResolvedValueOnce({
      assetId: 'opfs-asset-1',
      createdAt: 10,
      location: { kind: 'opfs', objectKey: 'objects/opfs-asset-1' },
      mimeType: 'image/png',
      sha256: null,
      size: assetBlob.size,
    });
  dbGetAllFromIndexMock.mockResolvedValueOnce([
    {
      assetId: 'opfs-asset-1',
      id: 'asset-1',
      projectId: 'project-1',
      galleryAssetId: null,
      mimeType: 'image/png',
      width: 100,
      height: 50,
      createdAt: 10,
      size: assetBlob.size,
    },
  ]);

  await expect(getScenarioAsset('asset-1')).resolves.toEqual(
    expect.objectContaining({ id: 'asset-1', mimeType: 'image/png' })
  );
  await expect(listScenarioAssets('project-1')).resolves.toEqual([
    expect.objectContaining({ id: 'asset-1', projectId: 'project-1' }),
  ]);
  const assetMocks = await import('../../assets');
  const recoverPublications = vi.mocked(assetMocks.recoverStandaloneAssetPublications);
  expect(recoverPublications).toHaveBeenCalledTimes(2);
  expect(recoverPublications.mock.invocationCallOrder[0]).toBeLessThan(
    dbGetMock.mock.invocationCallOrder[0] ?? 0
  );
});

it('filters malformed scenario asset rows at the DB boundary', async () => {
  dbGetMock.mockResolvedValueOnce(createScenarioAssetRow({ assetId: null }));
  dbGetAllFromIndexMock.mockResolvedValueOnce([
    createScenarioAssetRow(),
    createScenarioAssetRow({
      id: 'asset-svg',
      mimeType: 'image/svg+xml',
      size: 11,
    }),
    createScenarioAssetRow({
      id: 'asset-2',
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
