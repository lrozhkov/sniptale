import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PAGE_STYLE_ASSET_KINDS,
  PAGE_STYLE_SCOPE_TYPES,
  type PageStylePatch,
} from '@sniptale/runtime-contracts/page-style';
import { PAGE_STYLE_LIMITS } from '@sniptale/runtime-contracts/page-style/limits';
import { saveRuleWithSharedAndOrphanAssets } from './test-support';
import type { SavePageStyleRestoreRuleInput } from './types';

const mocks = vi.hoisted(() => ({
  deleteAsset: vi.fn(),
  localGet: vi.fn(),
  localSet: vi.fn(),
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../infrastructure/browser-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../infrastructure/browser-storage')>()),
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

const PATCH: PageStylePatch = {
  assets: [],
  declarations: [{ property: 'color', value: '#111111' }],
};

async function importStorage() {
  vi.resetModules();
  return import('./index');
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

describe('page style storage write budget boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    setupStorageState({});
  });

  it('rejects oversized templates before persisting registry changes', async () => {
    const storage = await importStorage();

    await expect(
      storage.savePageStyleTemplate({
        id: 't'.repeat(PAGE_STYLE_LIMITS.maxRecordIdLength + 1),
        name: 'Oversized',
        patch: PATCH,
      })
    ).rejects.toThrow('Page style registry exceeds storage limits.');
    await expect(
      storage.savePageStyleTemplate({
        id: 'oversized-template',
        name: 'x'.repeat(PAGE_STYLE_LIMITS.maxNameLength + 1),
        patch: PATCH,
      })
    ).rejects.toThrow('Page style registry exceeds storage limits.');
    expect(mocks.localSet).not.toHaveBeenCalled();
  });

  it('rejects oversized restore rules before persisting registry changes', async () => {
    const storage = await importStorage();

    await expect(
      storage.savePageStyleRestoreRule(createOversizedRetainedRuleInput())
    ).rejects.toThrow('Page style registry exceeds storage limits.');
    await expect(
      storage.savePageStyleRestoreRule(createOversizedTemplateRefRuleInput())
    ).rejects.toThrow('Page style registry exceeds storage limits.');
    expect(mocks.localSet).not.toHaveBeenCalled();
  });
});

describe('page style storage asset cleanup boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    setupStorageState({});
  });

  it('cleans only assets not referenced by rules when deleting templates', async () => {
    const storage = await importStorage();

    await saveRuleWithSharedAndOrphanAssets(storage);
    await storage.savePageStyleTemplate({
      id: 'template-asset',
      name: 'Template asset',
      patch: createTemplateAssetPatch(),
    });

    await expect(
      storage.deletePageStyleTemplateWithAssetCleanup('template-asset', {
        deleteAsset: mocks.deleteAsset,
      })
    ).resolves.toEqual({
      cleanupFailedAssetIds: [],
      deleted: true,
    });
    expect(mocks.deleteAsset).toHaveBeenCalledTimes(1);
    expect(mocks.deleteAsset).toHaveBeenCalledWith('asset-template-only');
  });
});

function createOversizedRetainedRuleInput(): SavePageStyleRestoreRuleInput {
  return {
    contentRetention: {
      text: {
        enabled: true,
        text: 'x'.repeat(PAGE_STYLE_LIMITS.maxRetainedTextLength + 1),
      },
    },
    id: 'r'.repeat(PAGE_STYLE_LIMITS.maxRecordIdLength + 1),
    name: 'Oversized',
    patch: PATCH,
    scope: {
      active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
      exactAddress: 'https://example.com/oversized',
    },
    selector: { locator: '#oversized' },
  };
}

function createOversizedTemplateRefRuleInput(): SavePageStyleRestoreRuleInput {
  return {
    id: 'oversized-rule',
    name: 'Oversized',
    patch: PATCH,
    scope: {
      active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
      exactAddress: 'https://example.com/oversized',
    },
    selector: { locator: '#oversized' },
    templateId: 't'.repeat(PAGE_STYLE_LIMITS.maxRecordIdLength + 1),
  };
}

function createTemplateAssetPatch(): PageStylePatch {
  return {
    assets: [
      {
        assetId: 'asset-shared',
        kind: PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE,
        mimeType: 'image/png',
      },
      {
        assetId: 'asset-template-only',
        kind: PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE,
        mimeType: 'image/png',
      },
    ],
    declarations: [{ property: 'background-image', value: null }],
  };
}
