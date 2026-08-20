import JSZip from 'jszip';
import { beforeEach, expect, it, vi } from 'vitest';

import {
  WebSnapshotCaptureMode,
  type WebSnapshotManifest,
} from '@sniptale/runtime-contracts/web-snapshot';
import type { MediaLibraryEntry } from '../../../../composition/persistence/media-library/contracts';
import { WEB_SNAPSHOT_PACKAGE_PATHS } from '../../../../features/web-snapshot/manifest';
import type { BackupArchiveReader } from './index';
import {
  runWithPersistenceMutationTransition,
  runWithPersistentDataErasureBarrier,
} from '../../../../composition/persistence/infrastructure/mutation-barrier';

const { createJournalMock, getMediaLibraryEntryMock, writeBlobToAssetMock } = vi.hoisted(() => ({
  createJournalMock: vi.fn(),
  getMediaLibraryEntryMock: vi.fn(),
  writeBlobToAssetMock: vi.fn(),
}));

vi.mock('../../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/assets')>()),
  createAssetPublicationJournal: createJournalMock,
  writeBlobToAsset: writeBlobToAssetMock,
}));

vi.mock('../../../../composition/persistence/media-library/index', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../composition/persistence/media-library/index')
  >()),
  getMediaLibraryEntry: getMediaLibraryEntryMock,
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

function createManifest(overrides: Partial<WebSnapshotManifest> = {}): WebSnapshotManifest {
  return {
    captureMode: WebSnapshotCaptureMode.ReadOnlyNoScripts,
    capturedAt: '2026-05-12T00:00:00.000Z',
    id: 'snapshot-original',
    paths: WEB_SNAPSHOT_PACKAGE_PATHS,
    schemaVersion: 1,
    source: { faviconUrl: null, title: 'Page', url: 'https://example.com' },
    stats: { assetCount: 0, failedAssetCount: 0, packageSize: 3 },
    warnings: [],
    ...overrides,
  };
}

function createWebSnapshotEntry(
  overrides: Partial<Omit<MediaLibraryEntry, 'blob'>> = {}
): Omit<MediaLibraryEntry, 'blob'> {
  return {
    createdAt: 10,
    duration: null,
    filename: 'snapshot.zip',
    height: 1080,
    id: 'snapshot-1',
    kind: 'web-archive',
    mimeType: 'application/x-sniptale-web-snapshot+zip',
    originalFilename: 'snapshot.zip',
    size: 123,
    source: { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 20,
    width: 1920,
    ...overrides,
  };
}

async function createPackageBlob(manifest: unknown, includeManifest = true): Promise<Blob> {
  const zip = new JSZip();
  if (includeManifest) {
    zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.manifest, JSON.stringify(manifest));
  }
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.snapshotHtml, '<main></main>');
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.screenshot, 'png');
  return zip.generateAsync({ type: 'blob' });
}

function createArchiveZip(packageBlob: Blob): BackupArchiveReader {
  return {
    file: vi.fn((path: string) =>
      path === 'assets/snapshot-1' ? { async: vi.fn().mockResolvedValue(packageBlob) } : null
    ),
  };
}

beforeEach(() => {
  getMediaLibraryEntryMock.mockReset();
  getMediaLibraryEntryMock.mockResolvedValue(undefined);
  createJournalMock.mockReset();
  createJournalMock.mockResolvedValue({ journalId: 'journal-1' });
  writeBlobToAssetMock.mockReset();
  writeBlobToAssetMock
    .mockResolvedValueOnce(createPreparedAsset('package-asset', 'application/zip'))
    .mockResolvedValueOnce(createPreparedAsset('screenshot-asset', 'image/png'));
});

it('prepares web snapshot imports with a package record parsed from the nested package manifest', async () => {
  const { loadBackupImportAssetBatch, prepareBackupImportAsset } = await import('.');
  const manifest = createManifest();
  const packageBlob = await createPackageBlob(manifest);
  const entry = createWebSnapshotEntry();

  const { prepared, resolvedConflict } = await prepareBackupImportAsset({
    asset: { assetPath: 'assets/snapshot-1', entry, thumbnailPath: null },
    remapEntryForDuplicate: vi.fn(),
    strategy: 'replace',
    zip: createArchiveZip(packageBlob),
  });
  const [loaded] = await loadBackupImportAssetBatch({
    operationId: 'restore-1',
    preparedAssets: prepared ? [prepared] : [],
    zip: createArchiveZip(packageBlob),
  });

  expect(resolvedConflict).toBe(false);
  expect(loaded).toEqual(
    expect.objectContaining({
      assetBlob: null,
      nextEntry: expect.objectContaining({ id: entry.id }),
      webSnapshotRecord: expect.objectContaining({
        createdAt: 10,
        id: 'snapshot-1',
        manifest: expect.objectContaining({
          source: { faviconUrl: null, title: 'Page', url: 'https://example.com/' },
        }),
        packageBlob: expect.any(Blob),
        updatedAt: 20,
      }),
    })
  );
});

it('aligns restored web snapshot media size with the rewritten package record', async () => {
  const { loadBackupImportAssetBatch, prepareBackupImportAsset } = await import('.');
  const manifest = createManifest();
  const packageBlob = await createPackageBlob(manifest);
  const entry = createWebSnapshotEntry({ size: 1 });

  const { prepared } = await prepareBackupImportAsset({
    asset: { assetPath: 'assets/snapshot-1', entry, thumbnailPath: null },
    remapEntryForDuplicate: vi.fn(),
    strategy: 'replace',
    zip: createArchiveZip(packageBlob),
  });
  const [loaded] = await loadBackupImportAssetBatch({
    operationId: 'restore-1',
    preparedAssets: prepared ? [prepared] : [],
    zip: createArchiveZip(packageBlob),
  });

  if (!loaded?.webSnapshotRecord) {
    throw new Error('Expected prepared web snapshot record.');
  }

  expect(loaded.nextEntry.size).toBe(loaded.webSnapshotRecord.size);
  expect(loaded.preparedAssetPublication?.asset.ref.size).toBeGreaterThan(0);
});

it('passes the outer restore admission through web snapshot OPFS staging', async () => {
  const { loadBackupImportAssetBatch, prepareBackupImportAsset } = await import('.');
  const packageBlob = await createPackageBlob(createManifest());
  const { prepared } = await prepareBackupImportAsset({
    asset: {
      assetPath: 'assets/snapshot-1',
      entry: createWebSnapshotEntry(),
      thumbnailPath: null,
    },
    remapEntryForDuplicate: vi.fn(),
    strategy: 'replace',
    zip: createArchiveZip(packageBlob),
  });
  let continueRestore!: () => void;
  let signalRestoreAdmitted!: () => void;
  const restoreAdmitted = new Promise<void>((resolve) => {
    signalRestoreAdmitted = resolve;
  });
  const restoreContinued = new Promise<void>((resolve) => {
    continueRestore = resolve;
  });
  const restore = runWithPersistenceMutationTransition(async (transitionPermit) => {
    signalRestoreAdmitted();
    await restoreContinued;
    await loadBackupImportAssetBatch({
      operationId: 'restore-1',
      preparedAssets: prepared ? [prepared] : [],
      transitionPermit,
      zip: createArchiveZip(packageBlob),
    });
    expect(writeBlobToAssetMock).toHaveBeenNthCalledWith(1, expect.any(Blob), {
      persistenceTransitionPermit: transitionPermit,
    });
    expect(writeBlobToAssetMock).toHaveBeenNthCalledWith(2, expect.any(Blob), {
      persistenceTransitionPermit: transitionPermit,
    });
  });
  await restoreAdmitted;
  const erase = vi.fn();
  const erasure = runWithPersistentDataErasureBarrier(erase);
  await Promise.resolve();
  expect(erase).not.toHaveBeenCalled();

  continueRestore();
  await restore;
  await erasure;

  expect(erase).toHaveBeenCalledOnce();
});

function createPreparedAsset(assetId: string, mimeType: string) {
  return {
    ref: {
      assetId,
      createdAt: 1,
      location: { kind: 'opfs' as const, objectKey: `objects/${assetId}` },
      mimeType,
      sha256: null,
      size: 3,
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

it('rejects web snapshot imports when the nested package manifest is malformed', async () => {
  const { loadBackupImportAssetBatch, prepareBackupImportAsset } = await import('.');
  const packageBlob = await createPackageBlob({ id: 'snapshot-1' });
  const { prepared } = await prepareBackupImportAsset({
    asset: {
      assetPath: 'assets/snapshot-1',
      entry: createWebSnapshotEntry(),
      thumbnailPath: null,
    },
    remapEntryForDuplicate: vi.fn(),
    strategy: 'replace',
    zip: createArchiveZip(packageBlob),
  });

  await expect(
    loadBackupImportAssetBatch({
      preparedAssets: prepared ? [prepared] : [],
      zip: createArchiveZip(packageBlob),
    })
  ).rejects.toThrow('Web snapshot package manifest is invalid.');
});

it('rejects web snapshot imports when the nested package manifest is missing', async () => {
  const { loadBackupImportAssetBatch, prepareBackupImportAsset } = await import('.');
  const packageBlob = await createPackageBlob(null, false);
  const { prepared } = await prepareBackupImportAsset({
    asset: {
      assetPath: 'assets/snapshot-1',
      entry: createWebSnapshotEntry(),
      thumbnailPath: null,
    },
    remapEntryForDuplicate: vi.fn(),
    strategy: 'replace',
    zip: createArchiveZip(packageBlob),
  });

  await expect(
    loadBackupImportAssetBatch({
      preparedAssets: prepared ? [prepared] : [],
      zip: createArchiveZip(packageBlob),
    })
  ).rejects.toThrow('Web snapshot package manifest is missing.');
});
