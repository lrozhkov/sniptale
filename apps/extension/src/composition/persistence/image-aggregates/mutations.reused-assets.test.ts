import { beforeEach, expect, it, vi } from 'vitest';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import { createPersistedEditorDocumentFixture } from '../document-assets/test-support';
import { createLibraryLifecycle } from '../library-lifecycle/contracts';

const mocks = vi.hoisted(() => ({
  assetSequence: 0,
  createJournal: vi.fn(),
  deleteAssetObject: vi.fn(async (_assetId: string) => undefined),
  cancelPublication: vi.fn(),
  discardPreparedAsset: vi.fn(async () => undefined),
  initDB: vi.fn(),
  releaseProtection: vi.fn(async () => undefined),
  recoverStandalone: vi.fn(async () => 0),
  runMutation: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: mocks.initDB,
}));

vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.runMutation,
}));

vi.mock('../assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assets')>()),
  buildPhysicalDeleteOperation: () => ({
    assetIds: [],
    createdAt: 1,
    kind: 'physical-delete',
    operationId: 'delete-1',
    status: 'pending',
    updatedAt: 1,
  }),
  completePhysicalDeleteOperation: vi.fn(async () => undefined),
  createAssetPublicationJournal: mocks.createJournal,
  deleteAssetObject: mocks.deleteAssetObject,
  cancelAssetPublication: mocks.cancelPublication,
  discardPreparedAsset: mocks.discardPreparedAsset,
  publishReadyJournalWithRetry: vi.fn(async (journal, publish) => publish(journal)),
  readAssetFile: vi.fn(async () => new File(['original'], 'image.png', { type: 'image/png' })),
  recoverStandaloneAssetPublications: mocks.recoverStandalone,
  releaseAssetReadyProtection: mocks.releaseProtection,
  writeBlobToAsset: vi.fn(async (blob: Blob) => {
    const assetId = `staged-${++mocks.assetSequence}`;
    return {
      ref: {
        assetId,
        createdAt: 1,
        location: { kind: 'opfs', objectKey: `objects/${assetId}` },
        mimeType: blob.type || 'application/octet-stream',
        sha256: null,
        size: blob.size,
      },
    };
  }),
}));

vi.mock('../../../platform/media-utils/image-thumbnail', () => ({
  createImageThumbnailBlob: vi.fn(async () => new Blob(['thumbnail'])),
}));

import { commitImageWorkspace, imageWorkspacePublicationAdapter } from './mutations';
import { recoverAndGetStoredImageWorkspace } from '../image-workspaces';

function createMediaRoot(revision: number) {
  return {
    blob: new Blob(['original'], { type: 'image/png' }),
    createdAt: 1,
    duration: null,
    filename: 'capture.png',
    height: 80,
    id: 'image-1',
    kind: 'image' as const,
    lifecycle: createLibraryLifecycle('temporary', 1),
    mimeType: 'image/png',
    originalFilename: 'capture.png',
    size: 8,
    source: { kind: 'screenshot' as const },
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 1,
    width: 100,
    workspaceRevision: revision,
  };
}

function installMixedWorkspaceTransaction() {
  const media = createMediaRoot(2);
  const workspace = {
    aggregateId: media.id,
    createdAt: 1,
    document: createPersistedEditorDocumentFixture(createEditorDocumentFixture()),
    revision: 2,
    sourceTitle: null,
    sourceUrl: null,
    updatedAt: 1,
  };
  const stores = {
    aggregate_presentations: { get: vi.fn(), put: vi.fn() },
    asset_operations: { put: vi.fn() },
    asset_owners: {
      delete: vi.fn(),
      index: vi.fn(() => ({ count: vi.fn(async () => 0) })),
      put: vi.fn(),
    },
    asset_refs: { delete: vi.fn(), put: vi.fn() },
    image_workspaces: { get: vi.fn(async () => workspace), put: vi.fn() },
    media_library: { get: vi.fn(async () => media), put: vi.fn() },
  };
  mocks.runMutation.mockImplementation(async (effect) =>
    effect({
      transaction: vi.fn(() => ({
        done: Promise.resolve(),
        objectStore: vi.fn((name: keyof typeof stores) => stores[name]),
      })),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assetSequence = 0;
  mocks.cancelPublication.mockImplementation(async (journal) => {
    for (const ref of journal.assetRefs) await mocks.deleteAssetObject(ref.assetId);
  });
  mocks.createJournal.mockImplementation(async (args) => ({
    ...args,
    createdAt: 1,
    journalId: 'mixed-journal',
  }));
  mocks.initDB.mockResolvedValue({ get: vi.fn(async () => undefined) });
  installMixedWorkspaceTransaction();
});

it('journals, replays, and rolls back only newly staged assets in a mixed publication', async () => {
  const runtimeSourceUrl = 'blob:hydrated-source';
  const reusedRef = {
    assetId: 'editor-source',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/editor-source' },
    mimeType: 'image/png',
    sha256: null,
    size: 6,
  };
  const document = createEditorDocumentFixture();
  document.sourceImageData = runtimeSourceUrl;
  document.frame.backgroundImageData = 'data:image/png;base64,Y2hhbmdlZA==';
  const input = {
    aggregateId: 'image-1',
    captureTime: 3,
    document,
    expectedRevision: 2,
    reusableAssetsByRuntimeUrl: new Map([[runtimeSourceUrl, reusedRef]]),
  };

  await commitImageWorkspace(input);

  const journal = await mocks.createJournal.mock.results[0]!.value;
  expect(journal.assetRefs.map((ref: { assetId: string }) => ref.assetId)).toEqual(['staged-1']);
  expect(journal.payload.refs.map((ref: { assetId: string }) => ref.assetId).sort()).toEqual([
    'editor-source',
    'staged-1',
  ]);
  expect(journal.payload.captureTime).toBe(3);
  expect(mocks.releaseProtection).toHaveBeenCalledWith(['staged-1']);

  mocks.initDB.mockResolvedValue({
    get: vi.fn(async (store: string) => {
      if (store === 'media_library') return createMediaRoot(4);
      return undefined;
    }),
  });
  await imageWorkspacePublicationAdapter.publish(journal);
  expect(mocks.deleteAssetObject).toHaveBeenCalledWith('staged-1');
  expect(mocks.deleteAssetObject).not.toHaveBeenCalledWith('editor-source');

  mocks.discardPreparedAsset.mockClear();
  mocks.createJournal.mockRejectedValueOnce(new Error('journal unavailable'));
  await expect(commitImageWorkspace(input)).rejects.toThrow('journal unavailable');
  expect(mocks.discardPreparedAsset).toHaveBeenCalledOnce();
  expect(mocks.discardPreparedAsset).toHaveBeenCalledWith('staged-2');
  expect(mocks.discardPreparedAsset).not.toHaveBeenCalledWith('editor-source');
});

it('recovers a losing two-tab publication when the winning role owns a different asset', async () => {
  const losingDocument = createEditorDocumentFixture();
  losingDocument.sourceImageData = 'blob:hydrated-source';
  losingDocument.frame.backgroundImageData = 'data:image/png;base64,bG9zZXI=';
  await commitImageWorkspace({
    aggregateId: 'image-1',
    document: losingDocument,
    expectedRevision: 2,
    reusableAssetsByRuntimeUrl: new Map([
      [
        'blob:hydrated-source',
        {
          assetId: 'editor-source',
          createdAt: 1,
          location: { kind: 'opfs', objectKey: 'objects/editor-source' },
          mimeType: 'image/png',
          sha256: null,
          size: 6,
        },
      ],
    ]),
  });
  const losingJournal = await mocks.createJournal.mock.results[0]!.value;
  const losingAssetId = losingJournal.assetRefs[0].assetId as string;
  const losingRole = losingJournal.payload.document.assets.find(
    (asset: { assetId: string }) => asset.assetId === losingAssetId
  ).role as string;
  const winnerAssetId = 'winning-background';
  const winnerRoot = createMediaRoot(3);
  const winningDocument = createPersistedEditorDocumentFixture(createEditorDocumentFixture());
  winningDocument.frame.backgroundImage = { assetId: winnerAssetId };
  winningDocument.assets.push({ assetId: winnerAssetId, role: losingRole });
  const winnerWorkspace = {
    aggregateId: 'image-1',
    createdAt: 1,
    document: winningDocument,
    revision: 3,
    sourceTitle: null,
    sourceUrl: null,
    updatedAt: 3,
  };
  const otherWorkspace = { ...winnerWorkspace, aggregateId: 'image-2', revision: 1 };
  const get = vi.fn(async (store: string, key: unknown) => {
    if (store === 'media_library' && key === 'image-1') return winnerRoot;
    if (store === 'image_workspaces' && key === 'image-1') return winnerWorkspace;
    if (store === 'image_workspaces' && key === 'image-2') return otherWorkspace;
    if (store === 'asset_owners') {
      return {
        assetId: winnerAssetId,
        ownerKind: 'image-workspace',
        ownerId: 'image-1',
        role: losingRole,
      };
    }
    return undefined;
  });
  mocks.initDB.mockResolvedValue({ get });
  mocks.recoverStandalone.mockClear();
  let pendingJournal: typeof losingJournal | null = losingJournal;
  mocks.recoverStandalone.mockImplementation(async () => {
    if (!pendingJournal) return 0;
    await imageWorkspacePublicationAdapter.publish(pendingJournal);
    pendingJournal = null;
    return 1;
  });

  await expect(recoverAndGetStoredImageWorkspace('image-1')).resolves.toEqual(winnerWorkspace);
  await expect(recoverAndGetStoredImageWorkspace('image-2')).resolves.toEqual(otherWorkspace);
  await expect(recoverAndGetStoredImageWorkspace('image-1')).resolves.toEqual(winnerWorkspace);
  expect(mocks.recoverStandalone).toHaveBeenCalledTimes(3);
  expect(mocks.deleteAssetObject).toHaveBeenCalledWith(losingAssetId);
  expect(mocks.deleteAssetObject).not.toHaveBeenCalledWith(winnerAssetId);
});

it.each([
  ['malformed root', 'media_library', { id: 'image-1' }],
  ['orphan workspace', 'image_workspaces', { aggregateId: 'image-1' }],
  ['orphan presentation', 'aggregate_presentations', { aggregateId: 'image-1' }],
])(
  'discards a pending image copy when its id has an occupied %s',
  async (_, occupiedStore, row) => {
    const document = createEditorDocumentFixture();
    document.frame.backgroundImageData = 'data:image/png;base64,Y2hhbmdlZA==';
    await commitImageWorkspace({ aggregateId: 'image-1', document, expectedRevision: 2 });
    const journal = await mocks.createJournal.mock.results[0]!.value;
    const copyJournal = {
      ...journal,
      payload: { ...journal.payload, requireMissingRoot: true },
    };
    mocks.runMutation.mockClear();
    mocks.initDB.mockResolvedValue({
      get: vi.fn(async (store: string) => (store === occupiedStore ? row : undefined)),
    });

    await expect(imageWorkspacePublicationAdapter.publish(copyJournal)).resolves.toBeUndefined();
    expect(mocks.runMutation).not.toHaveBeenCalled();
    expect(mocks.deleteAssetObject).toHaveBeenCalledWith(copyJournal.assetRefs[0].assetId);
  }
);

it('keeps staged bytes when an occupied copy id has ambiguous asset ownership', async () => {
  const document = createEditorDocumentFixture();
  document.frame.backgroundImageData = 'data:image/png;base64,Y2hhbmdlZA==';
  await commitImageWorkspace({ aggregateId: 'image-1', document, expectedRevision: 2 });
  const journal = await mocks.createJournal.mock.results[0]!.value;
  expect(journal.assetRefs).toHaveLength(2);
  const stagedRef = journal.assetRefs[1];
  mocks.initDB.mockResolvedValue({
    get: vi.fn(async (store: string, key: unknown) => {
      if (store === 'media_library') return { id: 'image-1' };
      if (store === 'asset_refs' && key === stagedRef.assetId) return stagedRef;
      return undefined;
    }),
  });
  mocks.deleteAssetObject.mockClear();

  await expect(
    imageWorkspacePublicationAdapter.publish({
      ...journal,
      payload: { ...journal.payload, requireMissingRoot: true },
    })
  ).rejects.toMatchObject({ name: 'StaleImageWorkspaceError' });
  expect(mocks.deleteAssetObject).not.toHaveBeenCalled();
});

it('discards an orphan workspace even when its document matches a pending copy', async () => {
  const document = createEditorDocumentFixture();
  document.frame.backgroundImageData = 'data:image/png;base64,Y2hhbmdlZA==';
  await commitImageWorkspace({ aggregateId: 'image-1', document, expectedRevision: 2 });
  const journal = await mocks.createJournal.mock.results[0]!.value;
  const workspace = {
    aggregateId: 'image-1',
    createdAt: 1,
    document: journal.payload.document,
    revision: 3,
    sourceTitle: null,
    sourceUrl: null,
    updatedAt: 1,
  };
  mocks.initDB.mockResolvedValue({
    get: vi.fn(async (store: string) => (store === 'image_workspaces' ? workspace : undefined)),
  });
  mocks.deleteAssetObject.mockClear();

  await imageWorkspacePublicationAdapter.publish({
    ...journal,
    payload: { ...journal.payload, requireMissingRoot: true },
  });

  expect(mocks.deleteAssetObject).toHaveBeenCalledWith(journal.assetRefs[0].assetId);
});

it('keeps bytes of an already committed copy during journal replay', async () => {
  const document = createEditorDocumentFixture();
  document.frame.backgroundImageData = 'data:image/png;base64,Y2hhbmdlZA==';
  await commitImageWorkspace({ aggregateId: 'image-1', document, expectedRevision: 2 });
  const journal = await mocks.createJournal.mock.results[0]!.value;
  const workspace = {
    aggregateId: 'image-1',
    createdAt: 1,
    document: journal.payload.document,
    revision: 3,
    sourceTitle: null,
    sourceUrl: null,
    updatedAt: 1,
  };
  mocks.initDB.mockResolvedValue({
    get: vi.fn(async (store: string, key: unknown) => {
      if (store === 'image_workspaces') return workspace;
      if (store === 'media_library') return createMediaRoot(3);
      if (store === 'asset_refs') {
        return journal.assetRefs.find((ref: { assetId: string }) => ref.assetId === key);
      }
      if (store === 'asset_owners' && Array.isArray(key)) {
        const ownedAsset = journal.payload.document.assets.find(
          (asset: { role: string }) => asset.role === key[2]
        );
        if (!ownedAsset) return undefined;
        return {
          assetId: ownedAsset.assetId,
          ownerId: 'image-1',
          ownerKind: 'image-workspace',
          role: ownedAsset.role,
        };
      }
      return undefined;
    }),
  });
  mocks.deleteAssetObject.mockClear();
  mocks.runMutation.mockClear();

  await imageWorkspacePublicationAdapter.publish({
    ...journal,
    payload: { ...journal.payload, requireMissingRoot: true },
  });

  expect(mocks.deleteAssetObject).not.toHaveBeenCalled();
  expect(mocks.runMutation).not.toHaveBeenCalled();
});
