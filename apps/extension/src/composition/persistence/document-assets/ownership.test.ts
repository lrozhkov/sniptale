import { expect, it, vi } from 'vitest';
import type { AssetOwner, AssetRef } from '../assets';
import { buildPhysicalDeleteOperation } from '../assets';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import { createPersistedEditorDocumentFixture } from './test-support';
import { replaceEditorDocumentAssetOwnership } from './ownership';

function ref(assetId: string): AssetRef {
  return {
    assetId,
    createdAt: 1,
    location: { kind: 'opfs', objectKey: `objects/${assetId}` },
    mimeType: 'image/png',
    sha256: null,
    size: 1,
  };
}

it('keeps a reused canvas asset when restoring it as the source image', async () => {
  const document = createPersistedEditorDocumentFixture(
    createEditorDocumentFixture(),
    'old-source'
  );
  const previousDocument = {
    ...document,
    assets: [
      { assetId: 'old-source', role: 'source-image' },
      { assetId: 'restored-source', role: 'canvas:$.objects[0].src' },
    ],
  };
  const nextDocument = {
    ...document,
    sourceImage: { assetId: 'restored-source' },
    assets: [{ assetId: 'restored-source', role: 'source-image' }],
  };
  const owners = new Map<string, AssetOwner>([
    [
      'source-image',
      {
        assetId: 'old-source',
        ownerId: 'image-1',
        ownerKind: 'image-workspace',
        role: 'source-image',
      },
    ],
    [
      'canvas:$.objects[0].src',
      {
        assetId: 'restored-source',
        ownerId: 'image-1',
        ownerKind: 'image-workspace',
        role: 'canvas:$.objects[0].src',
      },
    ],
  ]);
  const refs = new Map([
    ['old-source', ref('old-source')],
    ['restored-source', ref('restored-source')],
  ]);
  const physicalDelete = buildPhysicalDeleteOperation([]);

  await replaceEditorDocumentAssetOwnership({
    nextDocument,
    nextRefs: [ref('restored-source')],
    ownerId: 'image-1',
    ownerKind: 'image-workspace',
    previousDocument,
    physicalDelete,
    stores: {
      owners: {
        delete: vi.fn(async (key) => {
          owners.delete(key[2]);
        }),
        index: vi.fn(() => ({
          count: async (assetId: string) =>
            [...owners.values()].filter((owner) => owner.assetId === assetId).length,
        })),
        put: vi.fn(async (owner) => {
          owners.set(owner.role, owner);
        }),
      },
      refs: {
        delete: vi.fn(async (assetId) => {
          refs.delete(assetId);
        }),
        put: vi.fn(async (asset) => {
          refs.set(asset.assetId, asset);
        }),
      },
    },
  });

  expect(physicalDelete.assetIds).toEqual(['old-source']);
  expect(owners.get('source-image')?.assetId).toBe('restored-source');
  expect(refs.has('restored-source')).toBe(true);
  expect(refs.has('old-source')).toBe(false);
});

it('retains shared originals and assigns each retained slot without deleting its byte owner', async () => {
  const document = createPersistedEditorDocumentFixture(createEditorDocumentFixture(), 'original');
  const fields = [
    'sniptaleRasterOriginalData',
    'sniptaleRasterColorData',
    'sniptaleRasterVisibilityData',
    'sniptaleRasterKeyData',
  ];
  const nextDocument = {
    ...document,
    version: 4 as const,
    assets: [
      ...document.assets,
      ...fields.map((field) => ({ assetId: 'original', role: `canvas:$.objects[0].${field}` })),
    ],
  };
  const physicalDelete = buildPhysicalDeleteOperation([]);
  const put = vi.fn();
  const remove = vi.fn();
  await replaceEditorDocumentAssetOwnership({
    nextDocument,
    previousDocument: document,
    nextRefs: [ref('original')],
    ownerId: 'image-1',
    ownerKind: 'image-workspace',
    physicalDelete,
    stores: {
      owners: { put, delete: remove, index: () => ({ count: async () => 1 }) },
      refs: { put: vi.fn(), delete: remove },
    },
  });
  expect(put.mock.calls.map(([owner]) => owner.role)).toEqual(
    nextDocument.assets.slice(document.assets.length).map(({ role }) => role)
  );
  expect(remove).not.toHaveBeenCalled();
  expect(physicalDelete.assetIds).toEqual([]);
});

it('writes only new owner roles and byte refs when a large retained graph receives one change', async () => {
  const assets = Array.from({ length: 1_000 }, (_, index) => ({
    assetId: `version-${index}`,
    role: `history:value:${index}`,
  }));
  const next = [...assets, { assetId: 'new-version', role: 'history:value:new' }];
  const putOwner = vi.fn();
  const putRef = vi.fn();
  const remove = vi.fn();
  const physicalDelete = buildPhysicalDeleteOperation([]);
  await replaceEditorDocumentAssetOwnership({
    nextDocument: { assets: next },
    previousDocument: { assets },
    nextRefs: next.map(({ assetId }) => ref(assetId)),
    ownerId: 'image-1',
    ownerKind: 'image-workspace',
    physicalDelete,
    stores: {
      owners: { put: putOwner, delete: remove, index: () => ({ count: async () => 1 }) },
      refs: { put: putRef, delete: remove },
    },
  });
  expect(putOwner).toHaveBeenCalledExactlyOnceWith({
    assetId: 'new-version',
    ownerId: 'image-1',
    ownerKind: 'image-workspace',
    role: 'history:value:new',
  });
  expect(putRef).toHaveBeenCalledExactlyOnceWith(ref('new-version'));
  expect(remove).not.toHaveBeenCalled();
  expect(physicalDelete.assetIds).toEqual([]);
});

it('does not write unchanged graphs and refuses missing bindings before changing ownership', async () => {
  const assets = [{ assetId: 'existing', role: 'source-image' }];
  const effect = vi.fn();
  const args = {
    nextDocument: { assets },
    previousDocument: { assets },
    nextRefs: [ref('existing')],
    ownerId: 'image',
    ownerKind: 'image-workspace',
    physicalDelete: buildPhysicalDeleteOperation([]),
    stores: {
      owners: { put: effect, delete: effect, index: () => ({ count: async () => 1 }) },
      refs: { put: effect, delete: effect },
    },
  };
  await replaceEditorDocumentAssetOwnership(args);
  expect(effect).not.toHaveBeenCalled();
  await expect(replaceEditorDocumentAssetOwnership({ ...args, nextRefs: [] })).rejects.toThrow(
    'ref is missing'
  );
  await expect(
    replaceEditorDocumentAssetOwnership({
      ...args,
      nextDocument: { assets: [...assets, ...assets] },
    })
  ).rejects.toThrow('roles must be unique');
  expect(effect).not.toHaveBeenCalled();
});
