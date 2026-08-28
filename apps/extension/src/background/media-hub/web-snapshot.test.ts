import { beforeEach, expect, it, vi } from 'vitest';
import type { PagePackageManifest } from '@sniptale/runtime-contracts/page-package';
import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';
import { createPagePackageArchiveFixture } from '../../features/web-snapshot/package.test-support';
import { saveWebSnapshotToMediaHub } from './web-snapshot';

const mocks = vi.hoisted(() => ({
  ensureHeadroom: vi.fn(),
  saveWebSnapshot: vi.fn(),
  validateRetainedScreenshot: vi.fn(),
}));

vi.mock('../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../workflows/media-hub/store')>()),
  saveWebSnapshotMediaAssetSafely: mocks.saveWebSnapshot,
}));

vi.mock('../../features/media-hub/storage-capacity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/media-hub/storage-capacity')>()),
  ensureMediaHubStorageHeadroom: mocks.ensureHeadroom,
  getStorageEstimateInfo: vi.fn(),
}));

vi.mock('../../features/web-snapshot/screenshot-validation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/web-snapshot/screenshot-validation')>()),
  validateRetainedWebSnapshotScreenshot: mocks.validateRetainedScreenshot,
}));

async function createPayload(
  manifest: Partial<PagePackageManifest> = {}
): Promise<Parameters<typeof saveWebSnapshotToMediaHub>[0]> {
  const fixture = await createPagePackageArchiveFixture({ manifest });
  return {
    assertPersistenceAllowed: vi.fn().mockResolvedValue(undefined),
    packageBlob: fixture.packageBlob,
    payload: {
      manifest: fixture.manifest,
      packageStagedBlobId: 'package-stage-1',
      screenshotMimeType: 'image/png' as const,
      screenshotStagedBlobId: 'screenshot-stage-1',
      snapshotSessionId: 'snapshot-session-1',
    },
    screenshotBlob: fixture.screenshotBlob,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  mocks.ensureHeadroom.mockReset();
  mocks.saveWebSnapshot.mockReset();
  mocks.validateRetainedScreenshot.mockReset();
  mocks.validateRetainedScreenshot.mockResolvedValue({ height: 1, width: 1 });
});

it('persists a verified Page Package through the existing media-hub authority', async () => {
  mocks.saveWebSnapshot.mockResolvedValue({ assetId: 'asset-1' });
  const input = await createPayload({
    source: {
      faviconUrl: 'https://example.com/favicon.ico',
      title: 'Example Page',
      url: 'https://example.com/page',
    },
  });
  input.assetId = 'asset-1';

  await expect(saveWebSnapshotToMediaHub(input)).resolves.toBe('asset-1');
  expect(mocks.ensureHeadroom).toHaveBeenCalledOnce();
  expect(mocks.saveWebSnapshot).toHaveBeenCalledWith(
    expect.objectContaining({
      filename: 'Example_Page.sniptale-page-package.zip',
      id: 'asset-1',
      packageBlob: input.packageBlob,
      sourceTitle: 'Example Page',
      sourceUrl: 'https://example.com/page',
    }),
    expect.any(Function)
  );
});

it('rechecks persistence permission after deferred headroom admission', async () => {
  let releaseHeadroom: () => void = () => undefined;
  let persistenceEnabled = true;
  const durableSave = vi.fn().mockResolvedValue({ assetId: 'asset-race' });
  mocks.ensureHeadroom.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        releaseHeadroom = resolve;
      })
  );
  mocks.saveWebSnapshot.mockImplementationOnce(
    async (input: unknown, assertPersistenceAllowed: () => Promise<void>) => {
      await assertPersistenceAllowed();
      return durableSave(input);
    }
  );
  const input = await createPayload();
  input.assertPersistenceAllowed = vi.fn(async () => {
    if (!persistenceEnabled) throw new Error('Web Snapshots were disabled before commit');
  });

  const save = saveWebSnapshotToMediaHub(input);
  await vi.waitFor(() => expect(mocks.ensureHeadroom).toHaveBeenCalledOnce());
  persistenceEnabled = false;
  releaseHeadroom();

  await expect(save).rejects.toThrow('disabled before commit');
  expect(durableSave).not.toHaveBeenCalled();
});

it('rejects unsanitized provenance instead of rewriting the active archive', async () => {
  const input = await createPayload({
    source: {
      faviconUrl: null,
      title: 'Sensitive',
      url: 'https://user:secret@example.com/path?token=secret',
    },
  });
  await expect(saveWebSnapshotToMediaHub(input)).rejects.toThrow('provenance is not sanitized');
  expect(mocks.saveWebSnapshot).not.toHaveBeenCalled();
});

it('uses a safe fallback filename when Page Package provenance is absent', async () => {
  mocks.saveWebSnapshot.mockResolvedValue({ assetId: 'asset-2' });
  await saveWebSnapshotToMediaHub(
    await createPayload({ source: { faviconUrl: null, title: null, url: null } })
  );
  expect(mocks.saveWebSnapshot).toHaveBeenCalledWith(
    expect.objectContaining({ filename: 'web-snapshot.sniptale-page-package.zip' }),
    expect.any(Function)
  );
});

it('rejects an invalid payload manifest and non-PNG retained screenshot', async () => {
  const invalidManifest = await createPayload();
  invalidManifest.payload.manifest = { id: 'snapshot-1' } as WebSnapshotManifest;
  await expect(saveWebSnapshotToMediaHub(invalidManifest)).rejects.toThrow(
    'Page Package manifest is invalid'
  );

  const invalidScreenshot = await createPayload();
  Reflect.set(invalidScreenshot.payload, 'screenshotMimeType', 'image/webp');
  invalidScreenshot.screenshotBlob = new Blob(['webp'], { type: 'image/webp' });
  await expect(saveWebSnapshotToMediaHub(invalidScreenshot)).rejects.toThrow(
    'screenshot is invalid'
  );
  expect(mocks.saveWebSnapshot).not.toHaveBeenCalled();
});
