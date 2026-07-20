import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PAGE_STYLE_ASSET_KINDS,
  PAGE_STYLE_SCOPE_TYPES,
  type PageStyleContentRetention,
  type PageStylePatch,
} from '@sniptale/runtime-contracts/page-style';

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

const EMPTY_PATCH: PageStylePatch = { assets: [], declarations: [] };

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

function createAssetPatch(...assetIds: string[]): PageStylePatch {
  return {
    assets: assetIds.map((assetId) => ({
      assetId,
      kind: PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE,
      mimeType: 'image/png',
    })),
    declarations: [{ property: 'background-image', value: null }],
  };
}

function createRuleInput(args: {
  contentRetention?: PageStyleContentRetention;
  patch: PageStylePatch;
}) {
  return {
    ...(args.contentRetention === undefined ? {} : { contentRetention: args.contentRetention }),
    id: 'rule-a',
    name: 'A',
    patch: args.patch,
    scope: {
      active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
      exactAddress: 'https://example.com/a',
    },
    selector: { locator: '#a' },
  };
}

describe('page style restore rule asset cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    setupStorageState({});
  });

  registerPatchAssetCleanupTests();
  registerRetainedImageCleanupTests();
  registerCleanupFailureTests();
  registerCreateOnlySaveGuardTests();
});

function registerPatchAssetCleanupTests() {
  it('cleans only unreferenced patch assets when updating a restore rule patch', async () => {
    const storage = await importStorage();
    await storage.savePageStyleTemplate({
      id: 'template-shared',
      name: 'Shared',
      patch: createAssetPatch('asset-shared'),
    });
    await storage.savePageStyleRestoreRule(
      createRuleInput({
        patch: createAssetPatch('asset-old', 'asset-shared'),
      })
    );

    await expect(
      storage.savePageStyleRestoreRuleWithAssetCleanup(createRuleInput({ patch: EMPTY_PATCH }), {
        deleteAsset: mocks.deleteAsset,
      })
    ).resolves.toEqual({
      cleanupFailedAssetIds: [],
      rule: expect.objectContaining({ id: 'rule-a', patch: EMPTY_PATCH }),
    });
    expect(mocks.deleteAsset).toHaveBeenCalledTimes(1);
    expect(mocks.deleteAsset).toHaveBeenCalledWith('asset-old');
  });
}

function registerRetainedImageCleanupTests() {
  it('cleans retained image assets when an update explicitly clears retention', async () => {
    const storage = await importStorage();
    await storage.savePageStyleRestoreRule(
      createRuleInput({
        contentRetention: {
          image: {
            asset: {
              assetId: 'asset-retained',
              kind: PAGE_STYLE_ASSET_KINDS.IMAGE_REPLACEMENT,
              mimeType: 'image/png',
            },
            enabled: true,
          },
        },
        patch: EMPTY_PATCH,
      })
    );

    await expect(
      storage.savePageStyleRestoreRuleWithAssetCleanup(
        createRuleInput({ contentRetention: {}, patch: EMPTY_PATCH }),
        { deleteAsset: mocks.deleteAsset }
      )
    ).resolves.toEqual({
      cleanupFailedAssetIds: [],
      rule: expect.objectContaining({ id: 'rule-a' }),
    });
    expect(mocks.deleteAsset).toHaveBeenCalledWith('asset-retained');
  });
}

function registerCleanupFailureTests() {
  it('persists restore rule updates and reports cleanup failures', async () => {
    const storage = await importStorage();
    mocks.deleteAsset.mockRejectedValueOnce(new Error('delete failed'));
    await storage.savePageStyleRestoreRule(
      createRuleInput({
        patch: createAssetPatch('asset-old'),
      })
    );

    await expect(
      storage.savePageStyleRestoreRuleWithAssetCleanup(createRuleInput({ patch: EMPTY_PATCH }), {
        deleteAsset: mocks.deleteAsset,
      })
    ).resolves.toEqual({
      cleanupFailedAssetIds: ['asset-old'],
      rule: expect.objectContaining({ id: 'rule-a', patch: EMPTY_PATCH }),
    });
    await expect(storage.listPageStyleRestoreRules()).resolves.toEqual([
      expect.objectContaining({ id: 'rule-a', patch: EMPTY_PATCH }),
    ]);
  });
}

function registerCreateOnlySaveGuardTests() {
  it('rejects restore rule updates through the create-only save entrypoint', async () => {
    const storage = await importStorage();
    await storage.savePageStyleRestoreRule(createRuleInput({ patch: EMPTY_PATCH }));

    await expect(
      storage.savePageStyleRestoreRule(
        createRuleInput({
          patch: createAssetPatch('asset-new'),
        })
      )
    ).rejects.toThrow('savePageStyleRestoreRuleWithAssetCleanup');
  });
}
