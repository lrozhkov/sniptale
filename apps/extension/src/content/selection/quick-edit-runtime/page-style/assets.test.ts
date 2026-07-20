// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { PAGE_STYLE_ASSET_KINDS } from '@sniptale/runtime-contracts/page-style';
import type { PageStyleAssetEntry } from '../../../../composition/persistence/page-style/contracts';
import { createPageStyleAssetResolver, findPatchAsset } from './assets';

function createAssetEntry(id: string): PageStyleAssetEntry {
  return {
    blob: new Blob(['image'], { type: 'image/png' }),
    createdAt: 1,
    filename: 'image.png',
    height: 10,
    id,
    kind: PAGE_STYLE_ASSET_KINDS.IMAGE_REPLACEMENT,
    mimeType: 'image/png',
    size: 5,
    updatedAt: 1,
    width: 20,
  };
}

it('resolves IndexedDB assets to cached object URLs and revokes them on dispose', async () => {
  const getAsset = vi.fn(async () => createAssetEntry('asset-1'));
  const createObjectUrl = vi.fn(() => 'blob:asset-1');
  const revokeObjectUrl = vi.fn();
  const resolver = createPageStyleAssetResolver({
    createObjectUrl,
    getAsset,
    revokeObjectUrl,
  });
  const reference = {
    assetId: 'asset-1',
    kind: PAGE_STYLE_ASSET_KINDS.IMAGE_REPLACEMENT,
  };

  await expect(resolver.resolveAssetUrl(reference, 'rule-1')).resolves.toEqual({
    diagnostics: [],
    url: 'blob:asset-1',
  });
  await expect(resolver.resolveAssetUrl(reference, 'rule-1')).resolves.toEqual({
    diagnostics: [],
    url: 'blob:asset-1',
  });
  resolver.dispose();

  expect(getAsset).toHaveBeenCalledTimes(1);
  expect(createObjectUrl).toHaveBeenCalledTimes(1);
  expect(revokeObjectUrl).toHaveBeenCalledWith('blob:asset-1');
});

it('reports missing or kind-mismatched assets', async () => {
  const resolver = createPageStyleAssetResolver({
    createObjectUrl: vi.fn(),
    getAsset: vi.fn(async () => undefined),
    revokeObjectUrl: vi.fn(),
  });

  await expect(
    resolver.resolveAssetUrl(
      { assetId: 'missing', kind: PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE },
      'rule-1'
    )
  ).resolves.toEqual({
    diagnostics: [
      {
        level: 'warning',
        message: 'Page style asset was not found',
        ruleId: 'rule-1',
      },
    ],
    url: null,
  });
});

it('finds patch assets by kind', () => {
  const asset = { assetId: 'asset-1', kind: PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE };

  expect(findPatchAsset([asset], PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE)).toBe(asset);
  expect(findPatchAsset([asset], PAGE_STYLE_ASSET_KINDS.IMAGE_REPLACEMENT)).toBeNull();
});
