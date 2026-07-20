import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PAGE_STYLE_ASSET_KINDS,
  PAGE_STYLE_SCOPE_TYPES,
  type PageStylePatch,
} from '@sniptale/runtime-contracts/page-style';
import {
  saveRuleWithSharedAndOrphanAssets,
  saveTemplateWithSharedAsset,
} from './storage/test-support';

const mocks = vi.hoisted(() => ({
  deletePageStyleAsset: vi.fn(),
  localGet: vi.fn(),
  localSet: vi.fn(),
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('./assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./assets')>()),
  deletePageStyleAsset: mocks.deletePageStyleAsset,
}));

vi.mock('../infrastructure/browser-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/browser-storage')>()),
  browserStorage: {
    local: {
      get: mocks.localGet,
      set: mocks.localSet,
    },
  },
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => mocks.logger,
}));

async function importPageStylePersistenceScenario() {
  vi.resetModules();
  const [persistence, storage] = await Promise.all([import('./index'), import('./storage')]);

  return { persistence, storage };
}

function setupStorageState(state: Record<string, unknown>) {
  mocks.localGet.mockImplementation(async (keys: string[]) => {
    const key = keys[0] ?? '';
    return { [key]: state[key] };
  });
  mocks.localSet.mockImplementation(async (items: Record<string, unknown>) => {
    Object.assign(state, items);
  });
}

describe('page style persistence cleanup coordinator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    setupStorageState({});
  });

  registerTemplateDeletionTests();
  registerTemplateUpdateCleanupTests();
  registerRuleUpdateCleanupTests();
  registerDirectAssetCleanupTests();
  registerMissingDeletionTests();
  registerSharedAssetRetentionTests();
  registerCleanupFailureTests();
  registerBooleanRuleDeletionTests();
});

function registerTemplateDeletionTests() {
  it('deletes template registry rows and unreferenced DB assets', async () => {
    const { persistence, storage } = await importPageStylePersistenceScenario();
    await storage.savePageStyleTemplate({
      id: 'template-asset',
      name: 'Template asset',
      patch: createTemplateOnlyAssetPatch(),
    });

    await expect(persistence.deletePageStyleTemplate('template-asset')).resolves.toBe(true);
    await expect(storage.listPageStyleTemplates()).resolves.toEqual([]);
    expect(mocks.deletePageStyleAsset).toHaveBeenCalledWith('asset-template-only');
  });
}

function registerTemplateUpdateCleanupTests() {
  it('updates templates and reports DB cleanup failures for removed assets', async () => {
    const { persistence, storage } = await importPageStylePersistenceScenario();
    mocks.deletePageStyleAsset.mockRejectedValueOnce(new Error('delete failed'));
    await storage.savePageStyleTemplate({
      id: 'template-asset',
      name: 'Template asset',
      patch: createTemplateOnlyAssetPatch(),
    });

    await expect(
      persistence.savePageStyleTemplateAndCleanupAssets({
        id: 'template-asset',
        name: 'Template asset',
        patch: createEmptyPatch(),
      })
    ).resolves.toEqual({
      cleanupFailedAssetIds: ['asset-template-only'],
      template: expect.objectContaining({ id: 'template-asset', patch: createEmptyPatch() }),
    });
    await expect(storage.listPageStyleTemplates()).resolves.toEqual([
      expect.objectContaining({ id: 'template-asset', patch: createEmptyPatch() }),
    ]);
  });
}

function registerRuleUpdateCleanupTests() {
  it('updates restore rules and reports DB cleanup failures for removed assets', async () => {
    const { persistence, storage } = await importPageStylePersistenceScenario();
    mocks.deletePageStyleAsset.mockRejectedValueOnce(new Error('delete failed'));
    await storage.savePageStyleRestoreRule({
      id: 'asset-rule',
      name: 'Asset rule',
      patch: createRuleAssetPatch(),
      scope: {
        active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
        exactAddress: 'https://example.com/assets',
      },
      selector: { locator: '#asset' },
    });

    await expect(
      persistence.savePageStyleRestoreRuleAndCleanupAssets({
        id: 'asset-rule',
        name: 'Asset rule',
        patch: createEmptyPatch(),
        scope: {
          active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
          exactAddress: 'https://example.com/assets',
        },
        selector: { locator: '#asset' },
      })
    ).resolves.toEqual({
      cleanupFailedAssetIds: ['asset-orphan'],
      rule: expect.objectContaining({ id: 'asset-rule', patch: createEmptyPatch() }),
    });
    await expect(storage.listPageStyleRestoreRules()).resolves.toEqual([
      expect.objectContaining({ id: 'asset-rule', patch: createEmptyPatch() }),
    ]);
  });
}

function registerDirectAssetCleanupTests() {
  it('cleans explicit DB asset ids only when the registry no longer references them', async () => {
    const { persistence, storage } = await importPageStylePersistenceScenario();
    await saveTemplateWithSharedAsset(storage);

    await expect(
      persistence.cleanupPageStyleAssetsIfUnreferenced(['asset-shared', 'asset-orphan'])
    ).resolves.toEqual({ cleanupFailedAssetIds: [] });
    expect(mocks.deletePageStyleAsset).toHaveBeenCalledTimes(1);
    expect(mocks.deletePageStyleAsset).toHaveBeenCalledWith('asset-orphan');
  });
}

function registerMissingDeletionTests() {
  it('returns false without DB cleanup when the registry item is missing', async () => {
    const { persistence } = await importPageStylePersistenceScenario();

    await expect(persistence.deletePageStyleTemplate('missing-template')).resolves.toBe(false);
    await expect(
      persistence.deletePageStyleRestoreRuleAndCleanupAssets('missing-rule')
    ).resolves.toEqual({
      cleanupFailedAssetIds: [],
      deleted: false,
    });
    expect(mocks.deletePageStyleAsset).not.toHaveBeenCalled();
  });
}

function registerSharedAssetRetentionTests() {
  it('retains DB assets still referenced by another registry item', async () => {
    const { persistence, storage } = await importPageStylePersistenceScenario();
    await saveTemplateWithSharedAsset(storage);
    await saveRuleWithSharedAndOrphanAssets(storage);

    await expect(
      persistence.deletePageStyleRestoreRuleAndCleanupAssets('asset-rule')
    ).resolves.toEqual({
      cleanupFailedAssetIds: [],
      deleted: true,
    });
    expect(mocks.deletePageStyleAsset).toHaveBeenCalledTimes(1);
    expect(mocks.deletePageStyleAsset).toHaveBeenCalledWith('asset-orphan');
  });
}

function registerCleanupFailureTests() {
  it('persists registry deletion and reports DB cleanup failures', async () => {
    const { persistence, storage } = await importPageStylePersistenceScenario();
    mocks.deletePageStyleAsset.mockRejectedValueOnce(new Error('delete failed'));
    await storage.savePageStyleRestoreRule({
      id: 'asset-rule',
      name: 'Asset rule',
      patch: createRuleAssetPatch(),
      scope: {
        active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
        exactAddress: 'https://example.com/assets',
      },
      selector: { locator: '#asset' },
    });

    await expect(
      persistence.deletePageStyleRestoreRuleAndCleanupAssets('asset-rule')
    ).resolves.toEqual({
      cleanupFailedAssetIds: ['asset-orphan'],
      deleted: true,
    });
    await expect(storage.listPageStyleRestoreRules()).resolves.toEqual([]);
  });
}

function registerBooleanRuleDeletionTests() {
  it('returns the deleted flag through the restore-rule convenience wrapper', async () => {
    const { persistence, storage } = await importPageStylePersistenceScenario();
    await storage.savePageStyleRestoreRule({
      id: 'plain-rule',
      name: 'Plain rule',
      patch: { assets: [], declarations: [{ property: 'color', value: '#111111' }] },
      scope: {
        active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
        exactAddress: 'https://example.com/plain',
      },
      selector: { locator: '#plain' },
    });

    await expect(persistence.deletePageStyleRestoreRule('plain-rule')).resolves.toBe(true);
    await expect(persistence.deletePageStyleRestoreRule('missing-rule')).resolves.toBe(false);
  });
}

function createTemplateOnlyAssetPatch(): PageStylePatch {
  return {
    assets: [
      {
        assetId: 'asset-template-only',
        kind: PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE,
        mimeType: 'image/png',
      },
    ],
    declarations: [{ property: 'background-image', value: null }],
  };
}

function createEmptyPatch(): PageStylePatch {
  return { assets: [], declarations: [] };
}

function createRuleAssetPatch(): PageStylePatch {
  return {
    assets: [
      {
        assetId: 'asset-orphan',
        kind: PAGE_STYLE_ASSET_KINDS.IMAGE_REPLACEMENT,
        mimeType: 'image/png',
      },
    ],
    declarations: [{ property: 'background-image', value: null }],
  };
}
