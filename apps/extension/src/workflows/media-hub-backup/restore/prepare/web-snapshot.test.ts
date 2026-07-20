import JSZip from 'jszip';
import { beforeEach, expect, it, vi } from 'vitest';

import {
  WebSnapshotCaptureMode,
  type WebSnapshotManifest,
} from '@sniptale/runtime-contracts/web-snapshot';
import type { MediaLibraryEntry } from '../../../../composition/persistence/media-library/contracts';
import { WEB_SNAPSHOT_PACKAGE_PATHS } from '../../../../features/web-snapshot/manifest';
import type { BackupArchiveReader } from './index';

const { getMediaLibraryEntryMock } = vi.hoisted(() => ({
  getMediaLibraryEntryMock: vi.fn(),
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
    preparedAssets: prepared ? [prepared] : [],
    zip: createArchiveZip(packageBlob),
  });

  expect(resolvedConflict).toBe(false);
  expect(loaded).toEqual(
    expect.objectContaining({
      assetBlob: packageBlob,
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
    preparedAssets: prepared ? [prepared] : [],
    zip: createArchiveZip(packageBlob),
  });

  if (!loaded?.webSnapshotRecord) {
    throw new Error('Expected prepared web snapshot record.');
  }

  expect(loaded.nextEntry.size).toBe(loaded.webSnapshotRecord.size);
  expect(loaded.webSnapshotRecord.size).toBe(loaded.webSnapshotRecord.packageBlob.size);
});

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
