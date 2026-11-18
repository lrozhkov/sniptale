import { beforeEach, expect, it, vi } from 'vitest';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import { createPersistedEditorDocumentFixture } from '../document-assets/test-support';
import { createMediaLibraryEntry } from '../projects/index.storage.test-support';
import { listImageProjectsForEditing } from './read';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  getAll: vi.fn(),
  initDB: vi.fn(),
  warn: vi.fn(),
  hydrate: vi.fn(),
  recover: vi.fn(),
  hydrateHistory: vi.fn(),
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
vi.mock('./history-codec', () => ({ hydratePersistedImageHistory: mocks.hydrateHistory }));

import {
  recoverAndGetImageWorkspace,
  recoverAndGetStoredImageWorkspace,
  recoverAndListImageWorkspaces,
  readImageOriginalSource,
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
  mocks.initDB.mockResolvedValue({
    get: mocks.get,
    getAll: mocks.getAll,
    transaction: () => ({
      done: Promise.resolve(),
      objectStore: (name: string) => ({
        get: (key: IDBValidKey) =>
          name === 'image_workspace_identities' ? Promise.resolve(undefined) : mocks.get(name, key),
        index: (index: string) => ({
          getAll: (key: IDBValidKey) => mocks.getAll(name, index, key),
        }),
      }),
    }),
  });
  mocks.hydrate.mockImplementation(async () => ({
    assetsByVectorDefinitionId: new Map(),
    assetsByRuntimeUrl: new Map([['blob:source', { assetId: 'image-1-source' }]]),
    document: createEditorDocumentFixture(),
    release: vi.fn(),
  }));
  mocks.recover.mockResolvedValue(0);
});

it('lists the current original’s named works and the legacy edited work', async () => {
  const original = createMediaLibraryEntry({ id: 'original', imageContentState: 'edited' });
  const legacy = createWorkspace(original.id, 7);
  const newest = createWorkspace('new-project', 13);
  mocks.get.mockImplementation(async (store: string, key: string) =>
    store === 'media_library' && key === original.id
      ? original
      : store === 'image_workspaces' && key === original.id
        ? legacy
        : undefined
  );
  mocks.getAll.mockResolvedValue([
    {
      ...newest,
      sourceMediaId: original.id,
      document: { ...newest.document, displayName: 'Latest edits' },
    },
    { ...createWorkspace('different', 30), sourceMediaId: 'other-original' },
  ]);
  await expect(listImageProjectsForEditing(original.id)).resolves.toEqual([
    { id: 'new-project', name: 'Latest edits', updatedAt: 13 },
    { id: original.id, name: original.filename, updatedAt: 7 },
  ]);
  expect(mocks.get).not.toHaveBeenCalledWith('sync_capture', 'profile');
  expect(mocks.getAll).toHaveBeenCalledExactlyOnceWith(
    'image_workspaces',
    'retentionReferenceKeys',
    'media:original'
  );
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
      documentAssetsByVectorDefinitionId: expect.any(Map),
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

it('resolves two image project IDs to one source without copying the blob', async () => {
  const blob = new Blob(['immutable image'], { type: 'image/png' });
  const original = createMediaLibraryEntry({
    id: 'original',
    kind: 'screenshot',
    source: { kind: 'screenshot' },
    mimeType: blob.type,
    size: blob.size,
    blob,
  });
  mocks.get.mockImplementation(async (store: string, key: string) => {
    if (store === 'media_library') return key === 'original' ? original : undefined;
    if (store === 'image_workspaces')
      return { ...createWorkspace(key, 10), sourceMediaId: 'original', revision: 3 };
    return undefined;
  });
  for (const id of ['first-project', 'second-project']) {
    const result = await readImageOriginalSource(id);
    expect(result.asset).toMatchObject({ id, workspaceRevision: 3, imageContentState: 'edited' });
    expect(result.blob).toBe(blob);
  }
  const source = await readImageOriginalSource('original');
  expect(source.asset?.id).toBe('original');
  expect(source.blob).toBe(blob);
  expect(source.sourceMediaId).toBeUndefined();

  const generation = 'current-project-generation';
  mocks.initDB.mockResolvedValueOnce({
    transaction: () => ({
      done: Promise.resolve(),
      objectStore: (name: string) => ({
        get: (key: IDBValidKey) =>
          name === 'image_workspace_identities'
            ? Promise.resolve({ version: 1, aggregateId: key, generation, retired: false })
            : mocks.get(name, key),
      }),
    }),
  });
  await expect(readImageOriginalSource('second-project', { includeBlob: false })).resolves.toEqual({
    asset: expect.objectContaining({ id: 'second-project', workspaceRevision: 3 }),
    sourceMediaId: 'original',
    sourceGeneration: generation,
    blob: undefined,
  });
});

it('refuses to open an independent image project after losing its original', async () => {
  mocks.get.mockImplementation(async (store: string) =>
    store === 'image_workspaces'
      ? { ...createWorkspace('image-project', 10), sourceMediaId: 'missing-original' }
      : undefined
  );
  await expect(readImageOriginalSource('image-project')).rejects.toMatchObject({
    name: 'MissingAssetObjectError',
  });
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

it('transfers hydrated vector refs and release ownership to the native workspace opener', async () => {
  const entry = createWorkspace('vector-image', 10);
  const refs = new Map([['definition-id', { assetId: 'vector-resource' }]]);
  const release = vi.fn();
  mocks.hydrate.mockResolvedValueOnce({
    assetsByRuntimeUrl: new Map(),
    assetsByVectorDefinitionId: refs,
    document: createEditorDocumentFixture(),
    release,
  });
  mocks.get.mockResolvedValueOnce(entry).mockResolvedValue({ assetId: 'vector-resource' });
  const opened = await recoverAndGetImageWorkspace('vector-image');
  expect(opened?.documentAssetsByVectorDefinitionId).toBe(refs);
  expect(release).not.toHaveBeenCalled();
  opened?.releaseDocumentAssets?.();
  expect(release).toHaveBeenCalledOnce();
});

it('releases hydrated document resources if persisted history cannot be opened', async () => {
  const entry = {
    ...createWorkspace('image-1', 10),
    history: {
      version: 1,
      epoch: 'epoch',
      cursor: 0,
      snapshots: [{ assetId: 'history-snapshot' }],
      values: [],
      actions: [null],
    },
  };
  const release = vi.fn();
  mocks.get.mockResolvedValueOnce(entry).mockResolvedValue({ assetId: 'fixture-ref' });
  mocks.hydrate.mockResolvedValueOnce({ document: createEditorDocumentFixture(), release });
  mocks.hydrateHistory.mockRejectedValueOnce(new Error('History asset unavailable'));
  await expect(recoverAndGetImageWorkspace('image-1')).rejects.toThrow('History asset unavailable');
  expect(release).toHaveBeenCalledOnce();
});
