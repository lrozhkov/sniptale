import {
  PAGE_STYLE_ASSET_KINDS,
  PAGE_STYLE_SCOPE_TYPES,
  type PageStylePatch,
} from '@sniptale/runtime-contracts/page-style';
import type * as PageStyleStorage from './index';

type PageStyleStorageModule = typeof PageStyleStorage;

export async function saveDefaultPageStyleRule(
  storage: PageStyleStorageModule,
  patch: PageStylePatch
) {
  await storage.savePageStyleRestoreRule({
    id: 'default-rule',
    name: 'Default',
    patch,
    scope: {
      active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
      exactAddress: 'https://example.com/default',
    },
    selector: { locator: '#default' },
  });
}

export async function saveRetainedPageStyleRule(storage: PageStyleStorageModule) {
  await storage.savePageStyleRestoreRule({
    contentRetention: {
      image: {
        asset: {
          assetId: 'asset-1',
          kind: PAGE_STYLE_ASSET_KINDS.IMAGE_REPLACEMENT,
          mimeType: 'image/png',
        },
        enabled: true,
      },
      text: { enabled: true, text: 'User approved text' },
    },
    id: 'retained-rule',
    name: 'Retained',
    patch: createRetainedRulePatch(),
    scope: {
      active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
      exactAddress: 'https://example.com/retained',
    },
    selector: { locator: '#retained' },
  });
}

export async function saveTemplateWithSharedAsset(storage: PageStyleStorageModule) {
  await storage.savePageStyleTemplate({
    id: 'template-asset',
    name: 'Template asset',
    patch: createSharedAssetPatch(),
  });
}

export async function saveRuleWithSharedAndOrphanAssets(storage: PageStyleStorageModule) {
  await storage.savePageStyleRestoreRule({
    id: 'asset-rule',
    name: 'Asset rule',
    patch: createSharedAndOrphanAssetPatch(),
    scope: {
      active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
      exactAddress: 'https://example.com/assets',
    },
    selector: { locator: '#asset' },
  });
}

function createRetainedRulePatch(): PageStylePatch {
  return {
    assets: [
      {
        assetId: 'asset-bg',
        kind: PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE,
        mimeType: 'image/png',
      },
    ],
    declarations: [{ property: 'background-image', value: null }],
  };
}

function createSharedAssetPatch(): PageStylePatch {
  return {
    assets: [
      {
        assetId: 'asset-shared',
        kind: PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE,
        mimeType: 'image/png',
      },
    ],
    declarations: [{ property: 'background-image', value: null }],
  };
}

function createSharedAndOrphanAssetPatch(): PageStylePatch {
  return {
    assets: [
      ...createSharedAssetPatch().assets,
      {
        assetId: 'asset-orphan',
        kind: PAGE_STYLE_ASSET_KINDS.IMAGE_REPLACEMENT,
        mimeType: 'image/png',
      },
    ],
    declarations: [{ property: 'background-image', value: null }],
  };
}
