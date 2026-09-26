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

it.each([false, true])(
  'retains the restored stored image original, workspace=%s',
  async (edited) => {
    const stores = new Map<
      string,
      { get: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> }
    >();
    const storeFor = (name: string) => {
      const store = stores.get(name) ?? { get: vi.fn(), put: vi.fn() };
      stores.set(name, store);
      return store;
    };
    mocks.runMutation.mockImplementation(async (effect) =>
      effect({ transaction: () => ({ objectStore: storeFor, done: Promise.resolve() }) })
    );
    const staged = ['original', ...(edited ? ['workspace'] : [])].map((id) => ({
      objectId: id,
      ref: {
        assetId: `restored-${id}`,
        createdAt: 1,
        location: { kind: 'opfs' as const, objectKey: `objects/restored-${id}` },
        mimeType: 'image/png',
        sha256: null,
        size: 5,
      },
    }));
    const document = encodePortableEditorDocument({
      document: createPersistedEditorDocumentFixture(createEditorDocumentFixture(), 'source'),
      objectsByAssetId: new Map([['source', 'workspace']]),
    });
    const result = await mediaLibraryRootPublisher.publish({
      envelope: {
        descriptor: {
          mediaSubtype: 'library-item',
          metadataPath: '_sniptale/metadata/media/image.json',
          objectCount: staged.length,
          rootId: 'scenario-asset:image',
          rootKind: 'media',
          totalBytes: staged.length * 5,
        },
        metadata: portableJson({
          entry: {
            createdAt: 1,
            duration: null,
            filename: 'image.png',
            height: 80,
            id: 'scenario-asset:image',
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
            workspaceRevision: edited ? 1 : 0,
          },
          originalObjectId: 'original',
          ...(edited
            ? {
                workspace: {
                  aggregateId: 'scenario-asset:image',
                  createdAt: 1,
                  document,
                  revision: 1,
                  sourceTitle: null,
                  sourceUrl: null,
                  updatedAt: 2,
                },
              }
            : {}),
        }),
        objects: [],
      },
      journal,
      session: session('replace'),
      staged,
    });
    expect(result.imported).toBe(true);
    expect(result.retainedAssetIds).toEqual(staged.map(({ ref }) => ref.assetId));
    expect(storeFor('media_library').put).toHaveBeenCalledWith(
      expect.objectContaining({
        source: { kind: 'stored-asset', assetId: 'restored-original' },
      })
    );
    expect(storeFor('asset_owners').put).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: 'restored-original',
        ownerKind: 'media-library',
        role: 'source',
      })
    );
    expect(storeFor('image_workspaces').put).toHaveBeenCalledTimes(edited ? 1 : 0);
  }
);
