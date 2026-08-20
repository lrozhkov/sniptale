import { beforeEach, expect, it, vi } from 'vitest';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import { createPersistedEditorDocumentFixture } from '../document-assets/test-support';
import { createLibraryLifecycle } from '../library-lifecycle/contracts';

const mocks = vi.hoisted(() => ({
  assetSequence: 0,
  createJournal: vi.fn(),
  deleteAssetObject: vi.fn(async () => undefined),
  discardPreparedAsset: vi.fn(async () => undefined),
  initDB: vi.fn(),
  releaseProtection: vi.fn(async () => undefined),
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
  discardPreparedAsset: mocks.discardPreparedAsset,
  publishReadyJournalWithRetry: vi.fn(async (journal, publish) => publish(journal)),
  recoverStandaloneAssetPublications: vi.fn(async () => 0),
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
