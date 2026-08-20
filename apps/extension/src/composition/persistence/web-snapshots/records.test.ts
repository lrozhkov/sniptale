import JSZip from 'jszip';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  WebSnapshotCaptureMode,
  type WebSnapshotManifest,
} from '@sniptale/runtime-contracts/web-snapshot';
import { WEB_SNAPSHOT_PACKAGE_PATHS } from '../../../features/web-snapshot/manifest';

const mocks = vi.hoisted(() => ({
  createJournal: vi.fn(),
  discardPreparedAsset: vi.fn(),
  measureImageBlob: vi.fn(async () => ({ height: 200, width: 300 })),
  publishJournal: vi.fn(),
  publishWithRetry: vi.fn(),
  recover: vi.fn(),
  writeBlobToAsset: vi.fn(),
}));

vi.mock('../assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assets')>()),
  createAssetPublicationJournal: mocks.createJournal,
  discardPreparedAsset: mocks.discardPreparedAsset,
  publishReadyJournalWithRetry: mocks.publishWithRetry,
  writeBlobToAsset: mocks.writeBlobToAsset,
}));

vi.mock('./publication', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./publication')>()),
  publishWebSnapshotJournal: mocks.publishJournal,
  recoverWebSnapshotPublications: mocks.recover,
}));

vi.mock('@sniptale/platform/browser/media/image-dimensions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/media/image-dimensions')>()),
  measureImageBlob: mocks.measureImageBlob,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', { randomUUID: () => 'snapshot-1' });
  mocks.recover.mockResolvedValue(0);
  mocks.discardPreparedAsset.mockResolvedValue(undefined);
  mocks.measureImageBlob.mockResolvedValue({ height: 200, width: 300 });
  mocks.createJournal.mockImplementation(async (input) => ({
    ...input,
    createdAt: 1,
    journalId: 'journal-1',
  }));
  mocks.publishWithRetry.mockResolvedValue(undefined);
  mocks.writeBlobToAsset
    .mockResolvedValueOnce(createPreparedAsset('package-asset', 'application/zip', 3))
    .mockResolvedValueOnce(createPreparedAsset('screenshot-asset', 'image/png', 3));
});

it('stages package and screenshot objects and publishes metadata without embedded bytes', async () => {
  const { saveWebSnapshotMediaAsset } = await import('./records');
  const result = await saveWebSnapshotMediaAsset({
    filename: 'snapshot.zip',
    manifest: createManifest(),
    packageBlob: await createPackageBlob(createManifest()),
    screenshotBlob: new Blob(['png'], { type: 'image/png' }),
  });

  expect(mocks.recover).toHaveBeenCalledOnce();
  expect(mocks.writeBlobToAsset).toHaveBeenCalledTimes(2);
  expect(result.snapshot).toMatchObject({
    id: 'snapshot-1',
    packageAssetId: 'package-asset',
    screenshotAssetId: 'screenshot-asset',
  });
  expect(result.snapshot).not.toHaveProperty('packageBlob');
  expect(result.snapshot).not.toHaveProperty('screenshotBlob');
  expect(mocks.createJournal).toHaveBeenCalledWith(
    expect.objectContaining({
      assetRefs: [
        expect.objectContaining({ assetId: 'package-asset' }),
        expect.objectContaining({ assetId: 'screenshot-asset' }),
      ],
      payload: expect.objectContaining({ snapshot: result.snapshot }),
    })
  );
  expect(mocks.publishWithRetry).toHaveBeenCalledWith(
    expect.objectContaining({ journalId: 'journal-1' }),
    mocks.publishJournal
  );
});

it('removes the successfully staged sibling when the other object write fails', async () => {
  const { saveWebSnapshotMediaAsset } = await import('./records');
  mocks.writeBlobToAsset.mockReset();
  mocks.writeBlobToAsset
    .mockResolvedValueOnce(createPreparedAsset('package-asset', 'application/zip', 3))
    .mockRejectedValueOnce(new DOMException('quota', 'QuotaExceededError'));

  await expect(
    saveWebSnapshotMediaAsset({
      filename: 'snapshot.zip',
      manifest: createManifest(),
      packageBlob: await createPackageBlob(createManifest()),
      screenshotBlob: new Blob(['png'], { type: 'image/png' }),
    })
  ).rejects.toThrow('write web snapshot objects: quota');

  expect(mocks.discardPreparedAsset).toHaveBeenCalledWith('package-asset');
  expect(mocks.createJournal).not.toHaveBeenCalled();
});

it('keeps ready objects protected when publication fails after journal creation', async () => {
  const { saveWebSnapshotMediaAsset } = await import('./records');
  mocks.publishWithRetry.mockRejectedValueOnce(new Error('transaction failed'));

  await expect(
    saveWebSnapshotMediaAsset({
      filename: 'snapshot.zip',
      manifest: createManifest(),
      packageBlob: await createPackageBlob(createManifest()),
      screenshotBlob: new Blob(['png'], { type: 'image/png' }),
    })
  ).rejects.toThrow('transaction failed');

  expect(mocks.discardPreparedAsset).not.toHaveBeenCalled();
});

it('surfaces both object write failures as one staging error', async () => {
  const { saveWebSnapshotMediaAsset } = await import('./records');
  mocks.writeBlobToAsset.mockReset();
  mocks.writeBlobToAsset
    .mockRejectedValueOnce(new Error('package failed'))
    .mockRejectedValueOnce(new Error('screenshot failed'));

  await expect(
    saveWebSnapshotMediaAsset({
      filename: 'snapshot.zip',
      manifest: createManifest(),
      packageBlob: await createPackageBlob(createManifest()),
      screenshotBlob: new Blob(['png'], { type: 'image/png' }),
    })
  ).rejects.toThrow('Web snapshot object writes failed.');
});

it('preserves write and cleanup failures when sibling staging cannot be rolled back', async () => {
  const { saveWebSnapshotMediaAsset } = await import('./records');
  mocks.writeBlobToAsset.mockReset();
  mocks.writeBlobToAsset
    .mockResolvedValueOnce(createPreparedAsset('package-asset', 'application/zip', 3))
    .mockRejectedValueOnce(new Error('screenshot failed'));
  mocks.discardPreparedAsset.mockRejectedValueOnce(new Error('cleanup failed'));

  await expect(
    saveWebSnapshotMediaAsset({
      filename: 'snapshot.zip',
      manifest: createManifest(),
      packageBlob: await createPackageBlob(createManifest()),
      screenshotBlob: new Blob(['png'], { type: 'image/png' }),
    })
  ).rejects.toThrow('Web snapshot object write and cleanup failed.');
});

it('reports pre-journal cleanup failure without losing the publication cause', async () => {
  const { saveWebSnapshotMediaAsset } = await import('./records');
  mocks.createJournal.mockRejectedValueOnce(new Error('journal failed'));
  mocks.discardPreparedAsset.mockRejectedValue(new Error('cleanup failed'));

  await expect(
    saveWebSnapshotMediaAsset({
      filename: 'snapshot.zip',
      manifest: createManifest(),
      packageBlob: await createPackageBlob(createManifest()),
      screenshotBlob: new Blob(['png'], { type: 'image/png' }),
    })
  ).rejects.toThrow('Web snapshot save cleanup failed.');
});

function createPreparedAsset(assetId: string, mimeType: string, size: number) {
  return {
    ref: {
      assetId,
      createdAt: 1,
      location: { kind: 'opfs' as const, objectKey: `objects/${assetId}` },
      mimeType,
      sha256: null,
      size,
    },
    writingMarker: {
      assetId,
      createdAt: 1,
      domain: 'web-snapshot-assets',
      markerId: `marker-${assetId}`,
      objectKey: `objects/${assetId}`,
    },
  };
}

async function createPackageBlob(manifest: WebSnapshotManifest): Promise<Blob> {
  const zip = new JSZip();
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.manifest, JSON.stringify(manifest));
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.snapshotHtml, '<main></main>');
  return zip.generateAsync({ type: 'blob' });
}

function createManifest(): WebSnapshotManifest {
  return {
    captureMode: WebSnapshotCaptureMode.ReadOnlyNoScripts,
    capturedAt: '2026-05-12T00:00:00.000Z',
    id: 'snapshot-1',
    paths: WEB_SNAPSHOT_PACKAGE_PATHS,
    schemaVersion: 1,
    source: { faviconUrl: null, title: 'Page', url: 'https://example.com' },
    stats: { assetCount: 0, failedAssetCount: 0, packageSize: 3 },
    warnings: [],
  };
}
