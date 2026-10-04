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
