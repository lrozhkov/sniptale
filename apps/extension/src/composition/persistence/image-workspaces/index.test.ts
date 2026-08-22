import { beforeEach, expect, it, vi } from 'vitest';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import { createPersistedEditorDocumentFixture } from '../document-assets/test-support';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  getAll: vi.fn(),
  initDB: vi.fn(),
  warn: vi.fn(),
  hydrate: vi.fn(),
  recover: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({ warn: mocks.warn }),
}));
vi.mock('../infrastructure/indexed-db/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: mocks.initDB,
}));
vi.mock('../document-assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../document-assets')>()),
  hydratePersistedEditorDocument: mocks.hydrate,
}));
vi.mock('../image-aggregates/mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../image-aggregates/mutations')>()),
  recoverImageWorkspacePublications: mocks.recover,
}));

import {
  recoverAndGetImageWorkspace,
  recoverAndGetStoredImageWorkspace,
  recoverAndListImageWorkspaces,
} from '.';

function createWorkspace(aggregateId: string, updatedAt: number) {
  return {
    aggregateId,
    createdAt: 1,
    document: createPersistedEditorDocumentFixture(
      createEditorDocumentFixture(),
      `${aggregateId}-source`
    ),
    revision: 1,
    sourceTitle: null,
    sourceUrl: null,
    updatedAt,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.initDB.mockResolvedValue({ get: mocks.get, getAll: mocks.getAll });
  mocks.hydrate.mockImplementation(async () => ({
    assetsByRuntimeUrl: new Map([['blob:source', { assetId: 'image-1-source' }]]),
    document: createEditorDocumentFixture(),
    release: vi.fn(),
  }));
  mocks.recover.mockResolvedValue(0);
});

it('returns a valid workspace and treats a missing row as absent without warning', async () => {
  const entry = createWorkspace('image-1', 10);
  mocks.get
    .mockResolvedValueOnce(entry)
    .mockResolvedValueOnce({ assetId: 'image-1-source' })
    .mockResolvedValueOnce(undefined);

  await expect(recoverAndGetImageWorkspace('image-1')).resolves.toEqual(
    expect.objectContaining({
      ...entry,
      document: createEditorDocumentFixture(),
      documentAssetsByRuntimeUrl: expect.any(Map),
    })
  );
  await expect(recoverAndGetImageWorkspace('missing')).resolves.toBeUndefined();
  expect(mocks.warn).not.toHaveBeenCalled();
});

it('fails closed and logs invalid persisted workspace rows', async () => {
  mocks.get.mockResolvedValue({ aggregateId: 'image-1', revision: 0 });

  await expect(recoverAndGetImageWorkspace('image-1')).resolves.toBeUndefined();
  expect(mocks.warn).toHaveBeenCalledWith('Ignoring invalid image workspace entry', {
    aggregateId: 'image-1',
  });
});

it('recovers before returning a stored workspace to transfer consumers', async () => {
  const entry = createWorkspace('image-1', 10);
  mocks.get.mockResolvedValueOnce(entry);

  await expect(recoverAndGetStoredImageWorkspace('image-1')).resolves.toEqual(entry);
  expect(mocks.recover).toHaveBeenCalledOnce();
});

it('filters invalid rows and sorts valid workspaces by latest mutation', async () => {
  const older = createWorkspace('older', 10);
  const newer = createWorkspace('newer', 20);
  mocks.getAll.mockResolvedValue([older, { invalid: true }, newer]);
  mocks.get.mockResolvedValue({ assetId: 'fixture-ref' });

  await expect(recoverAndListImageWorkspaces()).resolves.toEqual([
    expect.objectContaining({ ...newer, document: createEditorDocumentFixture() }),
    expect.objectContaining({ ...older, document: createEditorDocumentFixture() }),
  ]);
});

it('replays a cold-runtime publication before the first workspace read', async () => {
  const order: string[] = [];
  mocks.recover.mockImplementationOnce(async () => {
    order.push('recover');
    return 1;
  });
  mocks.get.mockImplementationOnce(async () => {
    order.push('read');
    return undefined;
  });

  await expect(recoverAndGetImageWorkspace('image-1')).resolves.toBeUndefined();
  expect(order).toEqual(['recover', 'read']);
});
