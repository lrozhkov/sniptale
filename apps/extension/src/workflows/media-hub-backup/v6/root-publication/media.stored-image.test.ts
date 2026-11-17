import { createLibraryLifecycle } from '../../../../composition/persistence/library-lifecycle/contracts';
import { expect, it, vi } from 'vitest';
import { createEditorDocumentFixture } from '../../../../editor/document/page-session/document.test-support';
import { createPersistedEditorDocumentFixture } from '../../../../composition/persistence/document-assets/test-support';
import { encodePortableEditorDocument } from '../root-codecs/editor-document';
import { journal, portableJson, session } from './media.review-assets.test-support';

const mocks = vi.hoisted(() => ({ runMutation: vi.fn(), readFile: vi.fn() }));
vi.mock('../../../../composition/persistence/assets', async (original) => ({
  ...(await original<typeof import('../../../../composition/persistence/assets')>()),
  appendCommittedArchiveRootInTransaction: vi.fn(),
  readAssetFile: mocks.readFile,
  completePhysicalDeleteOperation: vi.fn(),
}));
vi.mock('../../../../composition/persistence/infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.runMutation,
}));

import { mediaLibraryRootPublisher } from './media';

it.each([
  [false, false],
  [true, false],
  [false, true],
  [true, true],
])(
  'retains the restored image original, workspace=%s projectAsset=%s',
  async (edited, imported) => {
    const rootId = imported ? 'project-asset:imported-image' : 'scenario-asset:image';
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
            source: imported
              ? { kind: 'project-asset', projectAssetId: 'imported-image' }
              : { kind: 'stored-asset' },
            sourceFavicon: null,
            sourceTitle: null,
            sourceUrl: null,
            tags: [],
            updatedAt: 2,
            width: 100,
            workspaceRevision: edited ? 1 : 0,
            lifecycle: { ...createLibraryLifecycle('temporary', 1), trashedAt: 3 },
          },
          originalObjectId: 'original',
          ...(imported
            ? {
                projectAsset: {
                  id: 'imported-image',
                  createdAt: 1,
                  mimeType: 'image/png',
                  size: 5,
                },
              }
            : {}),
          ...(edited
            ? {
                workspace: {
                  aggregateId: rootId,
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
    expect(storeFor('image_workspace_identities').put).toHaveBeenCalledWith({
      version: 1,
      aggregateId: rootId,
      generation: expect.any(String),
      retired: false,
    });
    expect(result.retainedAssetIds).toEqual(staged.map(({ ref }) => ref.assetId));
    expect(storeFor('media_library').put).toHaveBeenCalledWith(
      expect.objectContaining({
        source: imported
          ? { kind: 'project-asset', projectAssetId: 'imported-image' }
          : { kind: 'stored-asset', assetId: 'restored-original' },
        lifecycle: expect.objectContaining({
          storageClass: edited ? 'library' : 'temporary',
          ...(edited ? { trashedAt: 3 } : {}),
        }),
      })
    );
    expect(storeFor('asset_owners').put).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: 'restored-original',
        ownerKind: imported ? 'project-asset' : 'media-library',
        role: imported ? 'body' : 'source',
      })
    );
    expect(storeFor('image_workspaces').put).toHaveBeenCalledTimes(edited ? 1 : 0);
    if (imported)
      expect(storeFor('project_assets').put).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'imported-image', assetId: 'restored-original' })
      );
  }
);

it.each(
  ([1, 2] as const).flatMap((version) => [false, true].map((damaged) => ({ version, damaged })))
)(
  'restores history-only resources and refuses damaged history before writing, format=$version damaged=$damaged',
  async ({ version, damaged }) => {
    const base = { ...createEditorDocumentFixture(), displayName: 'First' };
    const documents = [base, { ...base, displayName: 'Second' }];
    const snapshots = documents.map((document) => JSON.stringify(document));
    const files = new Map([
      ['source', new Blob(['source'], { type: 'image/png' })],
      ...(version === 1
        ? snapshots.map((snapshot, index): [string, Blob] => [
            `snapshot-${index}`,
            new Blob(
              [damaged && index === 1 ? snapshot.replace('Second', 'Broken') + '!' : snapshot],
              {
                type: 'application/json',
              }
            ),
          ])
        : []),
    ]);
    if (version === 2)
      files.set(
        'packed',
        new Blob(
          [
            JSON.stringify({
              version: 1,
              snapshots: snapshots.map((value, index) =>
                damaged && index === 1 ? value + '!' : value
              ),
              values: [],
            }),
          ],
          { type: 'application/json' }
        )
      );
    const staged = [...files].map(([objectId, blob]) => ({
      objectId,
      ref: {
        assetId: `native-${objectId}`,
        createdAt: 1,
        mimeType: blob.type,
        size: blob.size,
        sha256: null,
        location: { kind: 'opfs' as const, objectKey: `objects/native-${objectId}` },
      },
    }));
    const stores = new Map<
      string,
      {
        get: ReturnType<typeof vi.fn>;
        put: ReturnType<typeof vi.fn>;
        delete: ReturnType<typeof vi.fn>;
        index: ReturnType<typeof vi.fn>;
      }
    >();
    const storeFor = (name: string) => {
      let store = stores.get(name);
      if (!store) {
        store = {
          get: vi.fn(),
          put: vi.fn(),
          delete: vi.fn(),
          index: vi.fn(() => ({
            getAll: vi.fn(async () => []),
            getAllKeys: vi.fn(async () => []),
          })),
        };
        stores.set(name, store);
      }
      return store;
    };
    mocks.runMutation.mockReset().mockImplementation(async (effect) =>
      effect({
        transaction: () => ({ objectStore: storeFor, done: Promise.resolve() }),
      })
    );
    mocks.readFile
      .mockReset()
      .mockImplementation(async (ref: { assetId: string }, filename: string) => {
        const file = files.get(ref.assetId.slice('native-'.length));
        if (!file) throw new Error('Missing test file');
        return new File([file], filename, { type: file.type });
      });
    const rootId = 'scenario-asset:history-image';
    const document = encodePortableEditorDocument({
      document: { ...createPersistedEditorDocumentFixture(base, 'source'), displayName: 'First' },
      objectsByAssetId: new Map([['source', 'source']]),
    });
    const publication = mediaLibraryRootPublisher.publish({
      envelope: {
        descriptor: {
          rootKind: 'media',
          mediaSubtype: 'library-item',
          rootId,
          metadataPath: '_sniptale/metadata/media/history.json',
          objectCount: staged.length,
          totalBytes: staged.reduce((sum, item) => sum + item.ref.size, 0),
        },
        metadata: portableJson({
          entry: {
            id: rootId,
            kind: 'image',
            source: { kind: 'stored-asset' },
            filename: 'history.png',
            originalFilename: 'history.png',
            createdAt: 1,
            updatedAt: 2,
            width: 100,
            height: 80,
            size: files.get('source')!.size,
            mimeType: 'image/png',
            duration: null,
            sourceUrl: null,
            sourceTitle: null,
            sourceFavicon: null,
            tags: [],
            workspaceRevision: 1,
            lifecycle: createLibraryLifecycle('library', 1),
          },
          originalObjectId: 'source',
          workspace: {
            aggregateId: rootId,
            createdAt: 1,
            updatedAt: 2,
            revision: 1,
            sourceTitle: 'First',
            sourceUrl: null,
            document,
            history: {
              version,
              epoch: 'saved-epoch',
              cursor: 0,
              snapshots:
                version === 1
                  ? [{ objectId: 'snapshot-0' }, { objectId: 'snapshot-1' }]
                  : snapshots.map(() => ({ objectId: 'packed' })),
              values: [],
              actions: [null, { operation: 'rename', target: null }],
            },
          },
        }),
        objects: [],
      },
      staged,
      journal,
      session: session('replace'),
    });
    if (damaged) {
      await expect(publication).rejects.toThrow();
      expect(mocks.runMutation).not.toHaveBeenCalled();
      return;
    }
    await expect(publication).resolves.toMatchObject({ imported: true });
    expect(storeFor('image_workspaces').put).toHaveBeenCalledWith(
      expect.objectContaining({
        history: expect.objectContaining({
          cursor: 0,
          version,
          snapshots:
            version === 1
              ? [{ assetId: 'native-snapshot-0' }, { assetId: 'native-snapshot-1' }]
              : snapshots.map(() => ({ assetId: 'native-packed' })),
        }),
      })
    );
    if (version === 2) {
      expect(
        mocks.readFile.mock.calls.filter(([ref]) => ref.mimeType === 'application/json')
      ).toHaveLength(1);
      expect(storeFor('asset_owners').put).toHaveBeenCalledWith(
        expect.objectContaining({
          assetId: 'native-packed',
          role: 'history:snapshot:native-packed',
        })
      );
    }
    for (const index of version === 1 ? [0, 1] : [])
      expect(storeFor('asset_owners').put).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerKind: 'image-workspace',
          assetId: `native-snapshot-${index}`,
          role: `history:snapshot:native-snapshot-${index}`,
        })
      );
  }
);
