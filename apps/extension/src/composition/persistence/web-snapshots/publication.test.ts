import { beforeEach, expect, it, vi } from 'vitest';
import { createPagePackageManifestFixture as createWebSnapshotManifest } from '../../../features/web-snapshot/manifest.test-support';
import type { AssetReadyJournal } from '../assets';

const mocks = vi.hoisted(() => ({
  createThumbnail: vi.fn(),
  readAssetFile: vi.fn(),
  recoverStandalone: vi.fn(),
  runMutation: vi.fn(),
  validateScreenshot: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.runMutation,
}));

vi.mock('../assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assets')>()),
  readAssetFile: mocks.readAssetFile,
  recoverStandaloneAssetPublications: mocks.recoverStandalone,
}));

vi.mock('./media-entry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./media-entry')>()),
  createWebSnapshotThumbnailEntry: mocks.createThumbnail,
}));

vi.mock('../../../features/web-snapshot/screenshot-validation', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../features/web-snapshot/screenshot-validation')
  >()),
  validateWebSnapshotScreenshotBlob: mocks.validateScreenshot,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readAssetFile.mockResolvedValue(new File(['png'], 'screenshot.png', { type: 'image/png' }));
  mocks.createThumbnail.mockResolvedValue({
    assetId: 'snapshot-1',
    blob: new Blob(['thumb'], { type: 'image/png' }),
    createdAt: 1,
    height: 180,
    updatedAt: 2,
    width: 320,
  });
  mocks.validateScreenshot.mockResolvedValue({ height: 720, width: 1280 });
});

it('publishes both refs, both owners, metadata, mirror, and thumbnail in one transaction', async () => {
  const writes: Array<[string, unknown]> = [];
  mocks.runMutation.mockImplementation(async (operation) =>
    operation({ transaction: vi.fn(() => createTransaction(writes)) })
  );
  const { publishWebSnapshotJournal } = await import('./publication');

  await publishWebSnapshotJournal(createJournal());

  expect(writes).toContainEqual([
    'asset_refs',
    expect.objectContaining({ assetId: 'package-asset' }),
  ]);
  expect(writes).toContainEqual([
    'asset_owners',
    {
      assetId: 'package-asset',
      ownerId: 'snapshot-1',
      ownerKind: 'web-snapshot',
      role: 'package',
    },
  ]);
  expect(writes).toContainEqual([
    'asset_owners',
    {
      assetId: 'screenshot-asset',
      ownerId: 'snapshot-1',
      ownerKind: 'web-snapshot',
      role: 'screenshot',
    },
  ]);
  expect(writes).toContainEqual([
    'web_snapshots',
    expect.not.objectContaining({ packageBlob: expect.anything() }),
  ]);
  expect(writes).toContainEqual([
    'media_library',
    expect.objectContaining({ source: { kind: 'web-snapshot', snapshotId: 'snapshot-1' } }),
  ]);
  expect(writes).toContainEqual(['thumbnails', expect.objectContaining({ assetId: 'snapshot-1' })]);
});

it('fails closed on an invalid existing ref instead of overwriting it', async () => {
  mocks.runMutation.mockImplementation(async (operation) =>
    operation({ transaction: vi.fn(() => createTransaction([], { invalid: true })) })
  );
  const { publishWebSnapshotJournal } = await import('./publication');

  await expect(publishWebSnapshotJournal(createJournal())).rejects.toThrow(
    'asset ref collides with an invalid record'
  );
});

it.each([
  'Web snapshot screenshot is invalid.',
  'Web snapshot screenshot dimensions exceed safe limits.',
])(
  'rejects an unsafe recovery screenshot before thumbnail decode or publication: %s',
  async (message) => {
    mocks.validateScreenshot.mockRejectedValue(new Error(message));
    const { publishWebSnapshotJournal } = await import('./publication');

    await expect(publishWebSnapshotJournal(createJournal())).rejects.toThrow(message);

    expect(mocks.createThumbnail).not.toHaveBeenCalled();
    expect(mocks.runMutation).not.toHaveBeenCalled();
  }
);

it('registers only standalone web snapshot journals for recovery', async () => {
  mocks.recoverStandalone.mockResolvedValue(1);
  const { recoverWebSnapshotPublications, WEB_SNAPSHOT_PUBLICATION_DOMAIN } =
    await import('./publication');

  await expect(recoverWebSnapshotPublications()).resolves.toBe(1);
  expect(mocks.recoverStandalone).toHaveBeenCalledWith([
    expect.objectContaining({ domain: WEB_SNAPSHOT_PUBLICATION_DOMAIN }),
  ]);
});

function createJournal(): AssetReadyJournal {
  const snapshot = {
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
  return {
    assetRefs: [
      createRef('package-asset', 'application/x-sniptale-page-package+zip', 5),
      createRef('screenshot-asset', 'image/png', 3),
    ],
    createdAt: 2,
    domain: 'web-snapshot-assets',
    journalId: 'journal-1',
    payload: {
      mediaEntry: {
        createdAt: 1,
        duration: null,
        filename: 'snapshot.zip',
        height: 720,
        id: 'snapshot-1',
        kind: 'web-archive',
        mimeType: 'application/x-sniptale-page-package+zip',
        originalFilename: 'snapshot.zip',
        size: 5,
        source: { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
        sourceFavicon: null,
        sourceTitle: 'Page',
        sourceUrl: 'https://example.com/',
        tags: [],
        updatedAt: 2,
        width: 1280,
      },
      snapshot,
    },
  };
}

function createRef(assetId: string, mimeType: string, size: number) {
  return {
    assetId,
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: `objects/${assetId}` },
    mimeType,
    sha256: null,
    size,
  };
}

function createTransaction(writes: Array<[string, unknown]>, existingRef?: unknown) {
  return {
    done: Promise.resolve(),
    objectStore(name: string) {
      return {
        get: vi.fn(async (key: unknown) =>
          name === 'asset_refs' && key === 'package-asset' ? existingRef : undefined
        ),
        put: vi.fn(async (value: unknown) => writes.push([name, value])),
      };
    },
  };
}
