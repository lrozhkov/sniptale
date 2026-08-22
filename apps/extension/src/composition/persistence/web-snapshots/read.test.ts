import { beforeEach, expect, it, vi } from 'vitest';
import { createWebSnapshotManifest } from '../../../features/web-snapshot/manifest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  initDB: vi.fn(),
  readAssetFile: vi.fn(),
  recover: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: mocks.initDB,
}));

vi.mock('../assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assets')>()),
  readAssetFile: mocks.readAssetFile,
}));

vi.mock('./publication', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./publication')>()),
  recoverWebSnapshotPublications: mocks.recover,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.initDB.mockResolvedValue({ get: mocks.get });
  mocks.recover.mockResolvedValue(0);
});

it('hydrates package and screenshot reads from their declared OPFS refs', async () => {
  const record = createStoredRecord();
  mocks.get.mockImplementation(async (store: string, key: string) => {
    if (store === 'web_snapshots' && key === 'snapshot-1') return record;
    if (store === 'asset_refs' && key === 'package-asset') return createRef('package-asset', 5);
    if (store === 'asset_refs' && key === 'screenshot-asset') {
      return createRef('screenshot-asset', 3, 'image/png');
    }
    return undefined;
  });
  mocks.readAssetFile.mockImplementation(
    async (ref, filename) => new File([ref.assetId], filename, { type: ref.mimeType })
  );
  const { getWebSnapshotRecord, getWebSnapshotScreenshotFile } = await import('./read');

  const hydrated = await getWebSnapshotRecord('snapshot-1');
  const screenshot = await getWebSnapshotScreenshotFile('snapshot-1');

  expect(hydrated?.packageFile).toBeInstanceOf(File);
  expect(hydrated).not.toHaveProperty('packageAssetId');
  expect(hydrated).not.toHaveProperty('screenshotAssetId');
  expect(screenshot).toBeInstanceOf(File);
  expect(mocks.readAssetFile).toHaveBeenCalledWith(
    expect.objectContaining({ assetId: 'screenshot-asset' }),
    'snapshot-1-screenshot'
  );
});

it('fails closed when metadata points to a missing asset ref', async () => {
  mocks.get.mockImplementation(async (store: string) =>
    store === 'web_snapshots' ? createStoredRecord() : undefined
  );
  const { getWebSnapshotPackageFile } = await import('./read');

  await expect(getWebSnapshotPackageFile('snapshot-1')).rejects.toThrow(
    'Web snapshot asset ref is missing: package-asset.'
  );
  expect(mocks.readAssetFile).not.toHaveBeenCalled();
});

it('returns undefined without touching OPFS when the snapshot row is absent', async () => {
  mocks.get.mockResolvedValue(undefined);
  const {
    getStoredWebSnapshotRecord,
    getWebSnapshotPackageFile,
    getWebSnapshotRecord,
    getWebSnapshotScreenshotFile,
  } = await import('./read');

  await expect(getStoredWebSnapshotRecord('missing')).resolves.toBeUndefined();
  await expect(getWebSnapshotPackageFile('missing')).resolves.toBeUndefined();
  await expect(getWebSnapshotScreenshotFile('missing')).resolves.toBeUndefined();
  await expect(getWebSnapshotRecord('missing')).resolves.toBeUndefined();
  expect(mocks.readAssetFile).not.toHaveBeenCalled();
});

function createStoredRecord() {
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

function createRef(assetId: string, size: number, mimeType = 'application/zip') {
  return {
    assetId,
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: `objects/${assetId}` },
    mimeType,
    sha256: null,
    size,
  };
}
