import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PAGE_STYLE_ASSET_KINDS,
  PAGE_STYLE_SCOPE_TYPES,
  type PageStylePatch,
  type PageStyleRegistry,
} from '@sniptale/runtime-contracts/page-style';
import { deleteTemplateAndCleanupAssets } from './cleanup';

const mocks = vi.hoisted(() => ({
  deleteAsset: vi.fn(),
  logger: {
    warn: vi.fn(),
  },
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => mocks.logger,
}));

describe('page style asset cleanup race boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not delete a template asset re-referenced after registry write', async () => {
    const loadRegistry = vi
      .fn()
      .mockResolvedValueOnce(createRegistryWithTemplateAsset())
      .mockResolvedValueOnce(createRegistryWithConcurrentRuleReference());
    const writeRegistry = vi.fn().mockResolvedValue(undefined);

    await expect(
      deleteTemplateAndCleanupAssets({
        deleteAsset: mocks.deleteAsset,
        loadRegistry,
        templateId: 'template-asset',
        writeRegistry,
      })
    ).resolves.toEqual({
      cleanupFailedAssetIds: [],
      deleted: true,
    });
    expect(writeRegistry).toHaveBeenCalledWith(expect.objectContaining({ templates: [] }));
    expect(mocks.deleteAsset).not.toHaveBeenCalled();
  });
});

function createRegistryWithTemplateAsset(): PageStyleRegistry {
  return {
    restoreRules: [],
    schemaVersion: 1,
    templates: [
      {
        createdAt: 1,
        id: 'template-asset',
        name: 'Template asset',
        patch: createAssetPatch(),
        propertySummary: ['background-image'],
        updatedAt: 1,
      },
    ],
  };
}

function createRegistryWithConcurrentRuleReference(): PageStyleRegistry {
  return {
    restoreRules: [
      {
        createdAt: 2,
        enabled: true,
        id: 'rule-race',
        name: 'Rule race',
        patch: createAssetPatch(),
        propertySummary: ['background-image'],
        scope: {
          active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
          exactAddress: 'https://example.com/race',
        },
        selector: { locator: '#race' },
        updatedAt: 2,
      },
    ],
    schemaVersion: 1,
    templates: [],
  };
}

function createAssetPatch(): PageStylePatch {
  return {
    assets: [
      {
        assetId: 'asset-race',
        kind: PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE,
        mimeType: 'image/png',
      },
    ],
    declarations: [{ property: 'background-image', value: null }],
  };
}
