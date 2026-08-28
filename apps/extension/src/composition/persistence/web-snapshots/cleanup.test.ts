import { beforeEach, expect, it, vi } from 'vitest';
import { createPagePackageManifestFixture as createWebSnapshotManifest } from '../../../features/web-snapshot/manifest.test-support';

const mocks = vi.hoisted(() => ({
  buildDelete: vi.fn(),
  completeDelete: vi.fn(),
  recover: vi.fn(),
  runMutation: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.runMutation,
}));

vi.mock('../assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assets')>()),
  buildPhysicalDeleteOperation: mocks.buildDelete,
  completePhysicalDeleteOperation: mocks.completeDelete,
}));

vi.mock('./publication', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./publication')>()),
  recoverWebSnapshotPublications: mocks.recover,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recover.mockResolvedValue(0);
  mocks.buildDelete.mockReturnValue({
    assetIds: [],
    createdAt: 1,
    kind: 'physical-delete',
    operationId: 'delete-1',
    status: 'pending',
    updatedAt: 1,
  });
  mocks.completeDelete.mockResolvedValue(undefined);
});

it('atomically removes both snapshot owners and schedules their OPFS objects for deletion', async () => {
  const writes: Array<[string, string, unknown]> = [];
  const snapshot = createStoredSnapshot();
  const media = createMediaEntry();
  const tx = {
    done: Promise.resolve(),
    objectStore(name: string) {
      return {
        delete: vi.fn(async (key: unknown) => writes.push([name, 'delete', key])),
        get: vi.fn(async (key: unknown) => {
          if (name === 'web_snapshots' && key === 'snapshot-1') return snapshot;
          if (name === 'media_library' && key === 'asset-1') return media;
          return undefined;
        }),
        index: vi.fn(() => ({ count: vi.fn(async () => 0) })),
        put: vi.fn(async (value: unknown) => writes.push([name, 'put', value])),
      };
    },
  };
  mocks.runMutation.mockImplementation(async (operation) =>
    operation({ transaction: vi.fn(() => tx) })
  );
  mocks.completeDelete.mockRejectedValueOnce(new Error('disk unavailable'));
  const { deleteWebSnapshotMediaAsset } = await import('./cleanup');

  await deleteWebSnapshotMediaAsset({ assetId: 'asset-1', snapshotId: 'snapshot-1' });

  expect(writes).toContainEqual([
    'asset_owners',
    'delete',
    ['web-snapshot', 'snapshot-1', 'package'],
  ]);
  expect(writes).toContainEqual([
    'asset_owners',
    'delete',
    ['web-snapshot', 'snapshot-1', 'screenshot'],
  ]);
  expect(writes).toContainEqual(['asset_refs', 'delete', 'package-asset']);
  expect(writes).toContainEqual(['asset_refs', 'delete', 'screenshot-asset']);
  expect(mocks.completeDelete).toHaveBeenCalledWith(
    expect.objectContaining({ assetIds: ['package-asset', 'screenshot-asset'] })
  );
});

it('fails closed for invalid snapshot metadata or a mismatched media owner', async () => {
  const { deleteWebSnapshotMediaAsset } = await import('./cleanup');
  const runCase = async (snapshot: unknown, media: unknown) => {
    mocks.runMutation.mockImplementationOnce(async (operation) =>
      operation({
        transaction: vi.fn(() => ({
          done: Promise.resolve(),
          objectStore: (name: string) => ({
            get: vi.fn(async () => (name === 'web_snapshots' ? snapshot : media)),
          }),
        })),
      })
    );
    return deleteWebSnapshotMediaAsset({ assetId: 'asset-1', snapshotId: 'snapshot-1' });
  };

  await expect(runCase({ invalid: true }, undefined)).rejects.toThrow(
    'Invalid web snapshot cannot be safely removed.'
  );
  await expect(
    runCase(undefined, { ...createMediaEntry(), source: { kind: 'screenshot' } })
  ).rejects.toThrow('Web snapshot media ownership does not match its record.');
});

it('keeps shared refs and skips physical deletion when another owner remains', async () => {
  const writes: Array<[string, string, unknown]> = [];
  const tx = {
    done: Promise.resolve(),
    objectStore(name: string) {
      return {
        delete: vi.fn(async (key: unknown) => writes.push([name, 'delete', key])),
        get: vi.fn(async (key: unknown) =>
          name === 'web_snapshots' && key === 'snapshot-1' ? createStoredSnapshot() : undefined
        ),
        index: vi.fn(() => ({ count: vi.fn(async () => 1) })),
        put: vi.fn(async (value: unknown) => writes.push([name, 'put', value])),
      };
    },
  };
  mocks.runMutation.mockImplementation(async (operation) =>
    operation({ transaction: vi.fn(() => tx) })
  );
  const { deleteWebSnapshotMediaAsset } = await import('./cleanup');

  await deleteWebSnapshotMediaAsset({ assetId: 'asset-1', snapshotId: 'snapshot-1' });

  expect(writes.some(([store]) => store === 'asset_refs')).toBe(false);
  expect(mocks.completeDelete).not.toHaveBeenCalled();
});

function createStoredSnapshot() {
  return {
    createdAt: 1,
    id: 'snapshot-1',
    manifest: createWebSnapshotManifest({
      id: 'snapshot-1',
      source: { faviconUrl: null, title: 'Page', url: 'https://example.com/' },
    }),
    packageAssetId: 'package-asset',
    screenshotAssetId: 'screenshot-asset',
    screenshotMimeType: 'image/png',
    screenshotSize: 3,
    size: 5,
    updatedAt: 2,
  };
}

function createMediaEntry() {
  return {
    createdAt: 1,
    duration: null,
    filename: 'snapshot.zip',
    height: null,
    id: 'asset-1',
    kind: 'web-archive',
    mimeType: 'application/x-sniptale-page-package+zip',
    originalFilename: 'snapshot.zip',
    size: 5,
    source: { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 2,
    width: null,
  };
}
