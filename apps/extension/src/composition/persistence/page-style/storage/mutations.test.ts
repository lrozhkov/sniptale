import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PAGE_STYLE_ASSET_KINDS,
  PAGE_STYLE_SCOPE_TYPES,
  type PageStylePatch,
} from '@sniptale/runtime-contracts/page-style';
import { saveRuleWithSharedAndOrphanAssets, saveTemplateWithSharedAsset } from './test-support';

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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

describe('page style restore rule settings and queued mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    setupStorageState({});
  });

  registerPageStyleScopeMutationTests();
  registerPageStyleCleanupMutationTests();
  registerPageStyleQueuedMutationTests();
});

function registerPageStyleScopeMutationTests() {
  it('updates rule scope without changing patch metadata or content retention', async () => {
    const storage = await importStorage();

    await storage.savePageStyleRestoreRule({
      contentRetention: { text: { enabled: true, text: 'Approved text' } },
      id: 'scope-rule',
      name: 'Scope',
      patch: PATCH,
      scope: {
        active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
        exactAddress: 'https://example.com/a',
      },
      selector: { locator: '#scope' },
    });

    vi.setSystemTime(2_000);

    await expect(
      storage.updatePageStyleRestoreRuleScope('scope-rule', {
        active: PAGE_STYLE_SCOPE_TYPES.DOMAIN,
        domain: 'example.com',
        exactAddress: 'https://example.com/a',
      })
    ).resolves.toEqual(
      expect.objectContaining({
        contentRetention: { text: { enabled: true, text: 'Approved text' } },
        patch: PATCH,
        updatedAt: 2_000,
      })
    );
    await expect(
      storage.updatePageStyleRestoreRuleScope('missing-rule', {
        active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
        exactAddress: 'https://example.com/missing',
      })
    ).resolves.toBeNull();
  });
}

function registerPageStyleCleanupMutationTests() {
  registerSharedAssetCleanupTests();
  registerFailedAssetCleanupTests();
  registerEmptyAssetCleanupTests();
}

function registerSharedAssetCleanupTests() {
  it('cleans only assets not referenced by other rules or templates when deleting rules', async () => {
    const storage = await importStorage();

    await saveTemplateWithSharedAsset(storage);
    await saveRuleWithSharedAndOrphanAssets(storage);

    await expect(
      storage.deletePageStyleRestoreRuleWithAssetCleanup('asset-rule', {
        deleteAsset: mocks.deleteAsset,
      })
    ).resolves.toEqual({
      cleanupFailedAssetIds: [],
      deleted: true,
    });
    expect(mocks.deleteAsset).toHaveBeenCalledWith('asset-orphan');
    await expect(
      storage.deletePageStyleRestoreRuleWithAssetCleanup('missing', {
        deleteAsset: mocks.deleteAsset,
      })
    ).resolves.toEqual({
      cleanupFailedAssetIds: [],
      deleted: false,
    });
  });
}

function registerFailedAssetCleanupTests() {
  it('reports asset cleanup failures after deleting a restore rule', async () => {
    const storage = await importStorage();
    mocks.deleteAsset.mockRejectedValueOnce(new Error('delete failed'));

    await storage.savePageStyleRestoreRule({
      id: 'asset-rule',
      name: 'Asset rule',
      patch: {
        assets: [
          {
            assetId: 'asset-orphan',
            kind: PAGE_STYLE_ASSET_KINDS.IMAGE_REPLACEMENT,
            mimeType: 'image/png',
          },
        ],
        declarations: [{ property: 'background-image', value: null }],
      },
      scope: {
        active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
        exactAddress: 'https://example.com/assets',
      },
      selector: { locator: '#asset' },
    });

    await expect(
      storage.deletePageStyleRestoreRuleWithAssetCleanup('asset-rule', {
        deleteAsset: mocks.deleteAsset,
      })
    ).resolves.toEqual({
      cleanupFailedAssetIds: ['asset-orphan'],
      deleted: true,
    });
    await expect(storage.listPageStyleRestoreRules()).resolves.toEqual([]);
  });
}

function registerEmptyAssetCleanupTests() {
  it('skips asset cleanup when the deleted rule has no asset references', async () => {
    const storage = await importStorage();

    await storage.savePageStyleRestoreRule({
      id: 'plain-rule',
      name: 'Plain rule',
      patch: PATCH,
      scope: {
        active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
        exactAddress: 'https://example.com/plain',
      },
      selector: { locator: '#plain' },
    });

    await expect(
      storage.deletePageStyleRestoreRuleWithAssetCleanup('plain-rule', {
        deleteAsset: mocks.deleteAsset,
      })
    ).resolves.toEqual({
      cleanupFailedAssetIds: [],
      deleted: true,
    });
    expect(mocks.deleteAsset).not.toHaveBeenCalled();
  });
}

function registerPageStyleQueuedMutationTests() {
  registerDerivedDomainScopeTests();
  registerQueuedCleanupTests();
}

function registerDerivedDomainScopeTests() {
  it('derives domain scope from an exact address when no domain is stored', async () => {
    const storage = await importStorage();

    await storage.savePageStyleRestoreRule({
      id: 'domain-rule',
      name: 'Domain rule',
      patch: PATCH,
      scope: {
        active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
        exactAddress: 'https://example.com/path',
      },
      selector: { locator: '#domain' },
    });

    await storage.updatePageStyleRestoreRuleScope('domain-rule', {
      active: PAGE_STYLE_SCOPE_TYPES.DOMAIN,
      domain: 'example.com',
      exactAddress: 'https://example.com/path',
    });

    await expect(
      storage.summarizePageStyleRulesForPage({
        pageDomain: 'example.com',
        pageUrl: 'https://example.com/other',
      })
    ).resolves.toEqual(
      expect.objectContaining({
        activeAppliedCount: 1,
      })
    );
  });
}

function registerQueuedCleanupTests() {
  it('keeps asset cleanup in the write queue before later registry mutations', async () => {
    const storage = await importStorage();
    const cleanup = createDeferred<void>();
    mocks.deleteAsset.mockReturnValueOnce(cleanup.promise);

    await storage.savePageStyleRestoreRule({
      id: 'asset-rule',
      name: 'Asset rule',
      patch: {
        assets: [
          {
            assetId: 'asset-orphan',
            kind: PAGE_STYLE_ASSET_KINDS.IMAGE_REPLACEMENT,
            mimeType: 'image/png',
          },
        ],
        declarations: [{ property: 'background-image', value: null }],
      },
      scope: {
        active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
        exactAddress: 'https://example.com/assets',
      },
      selector: { locator: '#asset' },
    });

    const deletePromise = storage.deletePageStyleRestoreRuleWithAssetCleanup('asset-rule', {
      deleteAsset: mocks.deleteAsset,
    });
    await Promise.resolve();
    const setCallsBeforeConcurrentSave = mocks.localSet.mock.calls.length;
    const savePromise = storage.savePageStyleTemplate({
      id: 'template-after-delete',
      name: 'Template after delete',
      patch: PATCH,
    });
    await Promise.resolve();

    expect(mocks.localSet).toHaveBeenCalledTimes(setCallsBeforeConcurrentSave);

    cleanup.resolve();
    await Promise.all([deletePromise, savePromise]);

    expect(mocks.localSet.mock.calls.length).toBeGreaterThan(setCallsBeforeConcurrentSave);
  });
}
