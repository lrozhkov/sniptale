import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PAGE_STYLE_ASSET_KINDS,
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

describe('page style template asset cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    setupStorageState({});
  });

  registerTemplateUpdateCleanupTests();
  registerTemplateCreateCleanupTests();
  registerCleanupFailureTests();
  registerDirectCleanupTests();
});

function registerTemplateUpdateCleanupTests() {
  it('cleans only unreferenced assets when updating a template patch', async () => {
    const storage = await importStorage();
    await storage.savePageStyleTemplate({
      id: 'template-a',
      name: 'A',
      patch: createAssetPatch('asset-old', 'asset-shared'),
    });
    await storage.savePageStyleTemplate({
      id: 'template-b',
      name: 'B',
      patch: createAssetPatch('asset-shared'),
    });

    await expect(
      storage.savePageStyleTemplateWithAssetCleanup(
        { id: 'template-a', name: 'A', patch: EMPTY_PATCH },
        { deleteAsset: mocks.deleteAsset }
      )
    ).resolves.toEqual({
      cleanupFailedAssetIds: [],
      template: expect.objectContaining({ id: 'template-a', patch: EMPTY_PATCH }),
    });
    expect(mocks.deleteAsset).toHaveBeenCalledTimes(1);
    expect(mocks.deleteAsset).toHaveBeenCalledWith('asset-old');
  });
}

function registerTemplateCreateCleanupTests() {
  it('creates new templates without deleting unrelated assets', async () => {
    const storage = await importStorage();

    await expect(
      storage.savePageStyleTemplateWithAssetCleanup(
        { id: 'template-a', name: 'A', patch: createAssetPatch('asset-new') },
        { deleteAsset: mocks.deleteAsset }
      )
    ).resolves.toEqual({
      cleanupFailedAssetIds: [],
      template: expect.objectContaining({
        id: 'template-a',
        patch: createAssetPatch('asset-new'),
      }),
    });
    expect(mocks.deleteAsset).not.toHaveBeenCalled();
  });
}

function registerCleanupFailureTests() {
  it('persists template updates and reports cleanup failures', async () => {
    const storage = await importStorage();
    mocks.deleteAsset.mockRejectedValueOnce(new Error('delete failed'));
    await storage.savePageStyleTemplate({
      id: 'template-a',
      name: 'A',
      patch: createAssetPatch('asset-old'),
    });

    await expect(
      storage.savePageStyleTemplateWithAssetCleanup(
        { id: 'template-a', name: 'A', patch: EMPTY_PATCH },
        { deleteAsset: mocks.deleteAsset }
      )
    ).resolves.toEqual({
      cleanupFailedAssetIds: ['asset-old'],
      template: expect.objectContaining({ id: 'template-a', patch: EMPTY_PATCH }),
    });
    await expect(storage.listPageStyleTemplates()).resolves.toEqual([
      expect.objectContaining({ id: 'template-a', patch: EMPTY_PATCH }),
    ]);
  });
}

function registerDirectCleanupTests() {
  it('cleans arbitrary asset ids only when the latest registry no longer references them', async () => {
    const storage = await importStorage();
    await storage.savePageStyleTemplate({
      id: 'template-a',
      name: 'A',
      patch: createAssetPatch('asset-retained'),
    });

    await expect(
      storage.cleanupPageStyleAssetsIfUnreferenced(['asset-retained', 'asset-orphan'], {
        deleteAsset: mocks.deleteAsset,
      })
    ).resolves.toEqual({ cleanupFailedAssetIds: [] });
    expect(mocks.deleteAsset).toHaveBeenCalledTimes(1);
    expect(mocks.deleteAsset).toHaveBeenCalledWith('asset-orphan');
  });
}
