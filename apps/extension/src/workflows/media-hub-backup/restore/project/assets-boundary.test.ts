import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry } from '../../../../composition/persistence/media-library/contracts';
import { PROJECT_ASSETS_STORE, SCENARIO_ASSETS_STORE } from '../../storage/constants';
import type { getStore } from '../../storage';
import type { BackupBlobDescriptor } from '../../contracts/types';

type BackupTransaction = Parameters<typeof getStore>[0];
type BackupObjectStore = ReturnType<BackupTransaction['objectStore']>;

const restoreMocks = vi.hoisted(() => ({
  getStore: vi.fn(),
}));

vi.mock('../../storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../storage')>()),
  getStore: restoreMocks.getStore,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('backup restore top-level project asset boundary', () => {
  it('rejects top-level project asset MIME before project asset store writes', async () => {
    const { writeMainAssetRecord } = await import('../write');
    const harness = createStoreHarness();

    await expect(
      writeMainAssetRecord(
        harness.tx,
        createProjectAssetMediaEntry({ mimeType: 'image/svg+xml' }),
        new Blob(['svg'], { type: 'image/svg+xml' }),
        null
      )
    ).rejects.toThrow('Unsupported project asset MIME type.');

    expect(harness.projectAssetsStore.put).not.toHaveBeenCalled();
    expect(harness.mediaLibraryStore.put).not.toHaveBeenCalled();
  });
});

describe('backup restore bundle project asset MIME boundary', () => {
  it('rejects video project bundle asset MIME before project asset store writes', async () => {
    const { restoreProjectAssetBlobDescriptor } = await import('./blobs');
    const harness = createStoreHarness();
    const blob = new Blob(['html'], { type: 'text/html' });

    await expect(
      restoreProjectAssetBlobDescriptor({
        blob,
        descriptor: {
          blobPath: 'project-assets/asset-1',
          entry: {
            createdAt: 1,
            id: 'asset-1',
            mimeType: 'text/html',
            size: 16,
          },
        },
        storeName: PROJECT_ASSETS_STORE,
        tx: harness.tx,
      })
    ).rejects.toThrow('Unsupported project asset MIME type.');

    expect(harness.projectAssetsStore.put).not.toHaveBeenCalled();
  });
});

it('rejects scenario bundle SVG assets before scenario asset store writes', async () => {
  const { restoreScenarioAssetBlobDescriptor } = await import('./blobs');
  const harness = createStoreHarness();
  const blob = new Blob(['<svg></svg>'], { type: 'image/svg+xml' });

  await expect(
    restoreScenarioAssetBlobDescriptor({
      blob,
      descriptor: {
        blobPath: 'scenario-projects/project-1/assets/asset-1',
        entry: createScenarioAssetBackupEntry({ mimeType: 'image/svg+xml', size: 11 }),
      },
      storeName: SCENARIO_ASSETS_STORE,
      tx: harness.tx,
    })
  ).rejects.toThrow('Unsupported scenario asset MIME type.');

  expect(harness.scenarioAssetsStore.put).not.toHaveBeenCalled();
});

it.each([
  ['missing width', { width: undefined }],
  ['missing height', { height: undefined }],
  ['missing createdAt', { createdAt: undefined }],
  ['malformed galleryAssetId', { galleryAssetId: 42 }],
])('rejects scenario bundle assets with %s before store writes', async (_label, overrides) => {
  const { restoreScenarioAssetBlobDescriptor } = await import('./blobs');
  const harness = createStoreHarness();
  const blob = new Blob(['png-bytes'], { type: 'image/png' });
  await expect(
    restoreScenarioAssetBlobDescriptor({
      blob,
      descriptor: {
        blobPath: 'scenario-projects/project-1/assets/asset-1',
        entry: createScenarioAssetBackupEntry({ size: blob.size, ...overrides }),
      },
      storeName: SCENARIO_ASSETS_STORE,
      tx: harness.tx,
    })
  ).rejects.toThrow('Invalid scenario asset backup entry.');

  expect(harness.scenarioAssetsStore.put).not.toHaveBeenCalled();
});

it('rejects scenario bundle assets whose metadata size does not match the blob', async () => {
  const { restoreScenarioAssetBlobDescriptor } = await import('./blobs');
  const harness = createStoreHarness();
  const blob = new Blob(['png-bytes'], { type: 'image/png' });

  await expect(
    restoreScenarioAssetBlobDescriptor({
      blob,
      descriptor: {
        blobPath: 'scenario-projects/project-1/assets/asset-1',
        entry: createScenarioAssetBackupEntry({ size: 999 }),
      },
      storeName: SCENARIO_ASSETS_STORE,
      tx: harness.tx,
    })
  ).rejects.toThrow('Scenario asset backup entry size does not match blob.');

  expect(harness.scenarioAssetsStore.put).not.toHaveBeenCalled();
});

describe('backup restore bundle project asset descriptor boundary', () => {
  it('rejects video project bundle assets missing MIME before store writes', async () => {
    const { restoreProjectAssetBlobDescriptor } = await import('./blobs');
    const harness = createStoreHarness();
    const blob = new Blob(['asset']);

    await expect(
      restoreProjectAssetBlobDescriptor({
        blob,
        descriptor: {
          blobPath: 'project-assets/asset-1',
          entry: {
            createdAt: 1,
            id: 'asset-1',
            size: 16,
          } as never,
        },
        storeName: PROJECT_ASSETS_STORE,
        tx: harness.tx,
      })
    ).rejects.toThrow('Project asset backup entry MIME type is missing.');

    expect(harness.projectAssetsStore.put).not.toHaveBeenCalled();
  });
});

describe('backup restore bundle project asset budget boundary', () => {
  it('rejects oversized video project bundle assets before project asset store writes', async () => {
    const { restoreProjectAssetBlobDescriptor } = await import('./blobs');
    const harness = createStoreHarness();
    const blob = new Blob(['image'], { type: 'image/png' });

    Object.defineProperty(blob, 'size', {
      configurable: true,
      value: 64 * 1024 * 1024 + 1,
    });
    await expect(
      restoreProjectAssetBlobDescriptor({
        blob,
        descriptor: {
          blobPath: 'project-assets/asset-1',
          entry: {
            createdAt: 1,
            id: 'asset-1',
            mimeType: 'image/png',
            size: blob.size,
          },
        },
        storeName: PROJECT_ASSETS_STORE,
        tx: harness.tx,
      })
    ).rejects.toThrow('Project asset exceeds storage size limit.');

    expect(harness.projectAssetsStore.put).not.toHaveBeenCalled();
  });
});

function createStoreHarness() {
  const mediaLibraryStore = createStore();
  const projectAssetsStore = createStore();
  const scenarioAssetsStore = createStore();
  const stores = new Map([
    ['media_library', mediaLibraryStore],
    [PROJECT_ASSETS_STORE, projectAssetsStore],
    [SCENARIO_ASSETS_STORE, scenarioAssetsStore],
  ]);

  const tx: BackupTransaction = {
    objectStore: (storeName) => {
      const store = stores.get(storeName);

      if (!store) {
        throw new Error(`Unknown store ${storeName}`);
      }

      return store;
    },
  };

  restoreMocks.getStore.mockImplementation((transaction: BackupTransaction, storeName: string) =>
    transaction.objectStore(storeName)
  );

  return { mediaLibraryStore, projectAssetsStore, scenarioAssetsStore, tx };
}

function createStore(): BackupObjectStore {
  return {
    delete: vi.fn(),
    get: vi.fn(),
    index: vi.fn(() => ({ getAll: vi.fn(async () => []) })),
    put: vi.fn(),
  };
}

function createScenarioAssetBackupEntry(
  overrides: Record<string, unknown> = {}
): BackupBlobDescriptor['entry'] {
  return {
    createdAt: 1,
    galleryAssetId: null,
    height: 100,
    id: 'asset-1',
    mimeType: 'image/png',
    projectId: 'project-1',
    size: 9,
    width: 100,
    ...overrides,
  } as BackupBlobDescriptor['entry'];
}

function createProjectAssetMediaEntry(
  overrides: Partial<Omit<MediaLibraryEntry, 'blob'>> = {}
): Omit<MediaLibraryEntry, 'blob'> {
  return {
    createdAt: 1,
    duration: null,
    filename: 'asset.png',
    height: 100,
    id: 'project-asset:asset-1',
    kind: 'image',
    mimeType: 'image/png',
    originalFilename: 'asset.png',
    size: 16,
    source: { kind: 'project-asset', projectAssetId: 'asset-1' },
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 1,
    width: 100,
    ...overrides,
  };
}
