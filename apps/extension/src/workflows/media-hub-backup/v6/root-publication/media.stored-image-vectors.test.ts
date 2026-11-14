import { createLibraryLifecycle } from '../../../../composition/persistence/library-lifecycle/contracts';
import { expect, it, vi } from 'vitest';
import { createEditorDocumentFixture } from '../../../../editor/document/page-session/document.test-support';
import { createPersistedEditorDocumentFixture } from '../../../../composition/persistence/document-assets/test-support';
import { encodePortableEditorDocument } from '../root-codecs/editor-document';
import { journal, portableJson, session } from './media.review-assets.test-support';

const mocks = vi.hoisted(() => ({ runMutation: vi.fn() }));
vi.mock('../../../../composition/persistence/assets', async (original) => ({
  ...(await original<typeof import('../../../../composition/persistence/assets')>()),
  appendCommittedArchiveRootInTransaction: vi.fn(),
  completePhysicalDeleteOperation: vi.fn(),
}));
vi.mock('../../../../composition/persistence/infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.runMutation,
}));

import { mediaLibraryRootPublisher } from './media';

const vectorId = 'a'.repeat(64);
const rootId = 'scenario-asset:image';

function installImageDatabase() {
  mocks.runMutation.mockClear();
  const createStore = () => ({
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    index: vi.fn(() => ({
      getAll: vi.fn(async () => []),
      getAllKeys: vi.fn(async () => []),
    })),
  });
  const stores = new Map<string, ReturnType<typeof createStore>>();
  const storeFor = (name: string) => {
    const store = stores.get(name) ?? createStore();
    stores.set(name, store);
    return store;
  };
  mocks.runMutation.mockImplementation(async (effect) =>
    effect({ transaction: () => ({ objectStore: storeFor, done: Promise.resolve() }) })
  );
  return { stores, storeFor };
}

function vectorArchiveInput(missingVector: boolean) {
  const staged = ['original', 'workspace', ...(!missingVector ? ['vector'] : [])].map((id) => ({
    objectId: id,
    ref: {
      assetId: `restored-${id}`,
      createdAt: 1,
      location: { kind: 'opfs' as const, objectKey: `objects/restored-${id}` },
      mimeType: id === 'vector' ? 'application/json' : 'image/png',
      sha256: null,
      size: 5,
    },
  }));
  const baseDocument = createPersistedEditorDocumentFixture(
    createEditorDocumentFixture(),
    'source'
  );
  const document = encodePortableEditorDocument({
    document: {
      ...baseDocument,
      version: 5,
      vectorDefinitions: { [vectorId]: { assetId: 'vector-source' } },
      assets: [
        { assetId: 'source', role: 'source-image' },
        { assetId: 'vector-source', role: `vector:${vectorId}` },
      ],
      canvasJson: JSON.stringify({
        objects: [
          {
            type: 'Group',
            objects: [],
            sniptaleType: 'vector-element',
            sniptaleVectorElement: {
              version: 1,
              definitionId: vectorId,
              overrides: { colors: {}, strokeScale: 1 },
            },
          },
        ],
      }),
    },
    objectsByAssetId: new Map([
      ['source', 'workspace'],
      ['vector-source', 'vector'],
    ]),
  });
  const input = {
    envelope: {
      descriptor: {
        mediaSubtype: 'library-item',
        metadataPath: '_sniptale/metadata/media/image.json',
        objectCount: staged.length,
        rootId: rootId,
        rootKind: 'media',
        totalBytes: staged.length * 5,
      },
      metadata: portableJson({
        entry: {
          createdAt: 1,
          duration: null,
          filename: 'image.png',
          height: 80,
          id: rootId,
          kind: 'image',
          mimeType: 'image/png',
          originalFilename: 'image.png',
          size: 5,
          source: { kind: 'stored-asset' },
          sourceFavicon: null,
          sourceTitle: null,
          sourceUrl: null,
          tags: [],
          updatedAt: 2,
          width: 100,
          workspaceRevision: 1,
          lifecycle: { ...createLibraryLifecycle('temporary', 1), trashedAt: 3 },
        },
        originalObjectId: 'original',
        workspace: {
          aggregateId: rootId,
          createdAt: 1,
          document,
          revision: 1,
          sourceTitle: null,
          sourceUrl: null,
          updatedAt: 2,
        },
      }),
      objects: [],
    },
    journal,
    session: session('replace'),
    staged,
  } satisfies Parameters<typeof mediaLibraryRootPublisher.publish>[0];
  return { input, document, staged };
}

it('publishes the restored image vector closure with remapped workspace and owner references', async () => {
  const { storeFor } = installImageDatabase();
  const { input, document, staged } = vectorArchiveInput(false);
  const result = await mediaLibraryRootPublisher.publish(input);
  expect(result.imported).toBe(true);
  expect(result.retainedAssetIds).toEqual(staged.map(({ ref }) => ref.assetId));
  expect(storeFor('image_workspaces').put).toHaveBeenCalledTimes(1);
  expect(storeFor('image_workspaces').put).toHaveBeenCalledWith(
    expect.objectContaining({
      document: expect.objectContaining({
        version: 5,
        sourceImage: { assetId: 'restored-workspace' },
        vectorDefinitions: { [vectorId]: { assetId: 'restored-vector' } },
        canvasJson: document.canvasJson,
      }),
    })
  );
  expect(storeFor('asset_owners').put).toHaveBeenCalledWith(
    expect.objectContaining({
      ownerKind: 'image-workspace',
      ownerId: rootId,
      role: `vector:${vectorId}`,
      assetId: 'restored-vector',
    })
  );
  expect(storeFor('media_library').put).toHaveBeenCalledWith(
    expect.objectContaining({
      source: { kind: 'stored-asset', assetId: 'restored-original' },
      lifecycle: expect.objectContaining({ storageClass: 'library', trashedAt: 3 }),
    })
  );
  expect(storeFor('asset_owners').put).toHaveBeenCalledWith(
    expect.objectContaining({
      assetId: 'restored-original',
      ownerKind: 'media-library',
      role: 'source',
    })
  );
});

it('refuses a restored image with a missing vector definition before publishing any root rows', async () => {
  const { stores } = installImageDatabase();
  const { input } = vectorArchiveInput(true);
  await expect(mediaLibraryRootPublisher.publish(input)).rejects.toThrow();
  expect(mocks.runMutation).not.toHaveBeenCalled();
  expect([...stores.values()].every((store) => store.put.mock.calls.length === 0)).toBe(true);
});
