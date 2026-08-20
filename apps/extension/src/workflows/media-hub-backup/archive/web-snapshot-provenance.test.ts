import JSZip from 'jszip';
import { expect, it, vi } from 'vitest';
import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';
import type { MediaLibraryEntry } from '../../../composition/persistence/media-library/contracts';
import type { StoredWebSnapshotRecord } from '../../../composition/persistence/web-snapshots/contracts';
import { createWebSnapshotManifest } from '../../../features/web-snapshot/manifest';

const mocks = vi.hoisted(() => ({ readAssetFile: vi.fn() }));

vi.mock('../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/assets')>()),
  readAssetFile: mocks.readAssetFile,
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

it('sanitizes legacy web snapshot package manifests before backup export', async () => {
  const { resolveBackupMediaBlob } = await import('.');
  const manifest = createLegacyManifest();
  const snapshot = await createSnapshot(manifest);

  const result = await resolveBackupMediaBlob(createDb(snapshot), createWebSnapshotEntry(manifest));
  expect(result).toBeInstanceOf(Blob);

  const zip = await JSZip.loadAsync(await result!.arrayBuffer());
  const manifestText = await zip.file('manifest.json')?.async('string');
  const sanitizedManifest = JSON.parse(manifestText ?? '{}');

  expect(sanitizedManifest.source).toEqual({
    faviconUrl: 'https://example.com/favicon.ico',
    title: 'Snapshot',
    url: 'https://example.com/',
  });
});

it('strips nested web snapshot package source metadata when backup source metadata is excluded', async () => {
  const { resolveBackupMediaBlob } = await import('.');
  const manifest = createLegacyManifest();
  const snapshot = await createSnapshot(manifest);

  const result = await resolveBackupMediaBlob(
    createDb(snapshot),
    createWebSnapshotEntry(manifest),
    {
      includeSourceMetadata: false,
    }
  );
  expect(result).toBeInstanceOf(Blob);

  const zip = await JSZip.loadAsync(await result!.arrayBuffer());
  const manifestText = await zip.file('manifest.json')?.async('string');
  const sanitizedManifest = JSON.parse(manifestText ?? '{}');

  expect(sanitizedManifest.source).toEqual({
    faviconUrl: null,
    title: null,
    url: null,
  });
});

it('strips nested web snapshot package source metadata from archived asset blobs', async () => {
  const { appendBackupAssetDescriptor } = await import('.');
  const manifest = createLegacyManifest();
  const snapshot = await createSnapshot(manifest);
  const assets: Parameters<typeof appendBackupAssetDescriptor>[0]['assets'] = [];
  const archivedBlobs = new Map<string, Blob>();

  await appendBackupAssetDescriptor({
    assets,
    budget: { totalBytes: 0 },
    db: createDb(snapshot),
    encodePathSegment: (value) => value,
    entry: createWebSnapshotEntry(manifest),
    options: {
      includeSourceMetadata: false,
      includeTelemetry: true,
      includeWebSnapshots: true,
      scope: 'all',
    },
    thumbnailCount: 0,
    zip: {
      file(path: string, blob: Blob) {
        archivedBlobs.set(path, blob);
      },
    },
  });

  const archivedBlob = archivedBlobs.get('assets/asset-1');
  expect(archivedBlob).toBeInstanceOf(Blob);
  const zip = await JSZip.loadAsync(await archivedBlob!.arrayBuffer());
  const manifestText = await zip.file('manifest.json')?.async('string');
  const sanitizedManifest = JSON.parse(manifestText ?? '{}');

  expect(sanitizedManifest.source).toEqual({
    faviconUrl: null,
    title: null,
    url: null,
  });
  expect(assets[0]?.entry).toEqual(
    expect.objectContaining({ sourceFavicon: null, sourceTitle: null, sourceUrl: null })
  );
});

it('aligns web snapshot backup metadata size with the archived rewritten package', async () => {
  const { appendBackupAssetDescriptor } = await import('.');
  const manifest = createLegacyManifest();
  const snapshot = await createSnapshot(manifest);
  const assets: Parameters<typeof appendBackupAssetDescriptor>[0]['assets'] = [];
  const archivedBlobs = new Map<string, Blob>();

  await appendBackupAssetDescriptor({
    assets,
    budget: { totalBytes: 0 },
    db: createDb(snapshot),
    encodePathSegment: (value) => value,
    entry: createWebSnapshotEntry(manifest),
    thumbnailCount: 0,
    zip: {
      file(path: string, blob: Blob) {
        archivedBlobs.set(path, blob);
      },
    },
  });

  const archivedBlob = archivedBlobs.get('assets/asset-1');
  expect(archivedBlob).toBeInstanceOf(Blob);
  expect(assets[0]?.entry.size).toBe(archivedBlob?.size);
});

async function createSnapshot(manifest: WebSnapshotManifest): Promise<StoredWebSnapshotRecord> {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest));
  zip.file('snapshot.html', '<main></main>');
  const packageBlob = await zip.generateAsync({ type: 'blob' });

  mocks.readAssetFile.mockResolvedValue(
    new File([packageBlob], 'snapshot.zip', { type: packageBlob.type })
  );
  return {
    createdAt: 10,
    id: 'snapshot-1',
    manifest,
    packageAssetId: 'snapshot-package-asset',
    screenshotAssetId: 'snapshot-screenshot-asset',
    screenshotMimeType: 'image/png',
    screenshotSize: 3,
    size: packageBlob.size,
    updatedAt: 20,
  };
}

function createLegacyManifest(): WebSnapshotManifest {
  return createWebSnapshotManifest({
    capturedAt: '2026-06-11T00:00:00.000Z',
    id: 'snapshot-1',
    source: {
      faviconUrl: 'https://user:pass@example.com/favicon.ico?secret=1',
      title: 'Snapshot',
      url: 'https://user:pass@example.com/reset/password?token=secret#hash',
    },
  });
}

function createWebSnapshotEntry(manifest: WebSnapshotManifest): MediaLibraryEntry {
  return {
    createdAt: 10,
    duration: null,
    filename: 'snapshot.zip',
    height: null,
    id: 'asset-1',
    kind: 'web-archive',
    mimeType: 'application/x-sniptale-web-snapshot+zip',
    originalFilename: 'snapshot.zip',
    size: 10,
    source: { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
    sourceFavicon: manifest.source.faviconUrl,
    sourceTitle: manifest.source.title,
    sourceUrl: manifest.source.url,
    tags: [],
    updatedAt: 20,
    width: null,
  };
}

function createDb(snapshot: StoredWebSnapshotRecord) {
  return {
    get: vi.fn(async (storeName: string, key: string) => {
      if (storeName === 'web_snapshots' && key === 'snapshot-1') return snapshot;
      if (storeName === 'asset_refs' && key === snapshot.packageAssetId) {
        return {
          assetId: snapshot.packageAssetId,
          createdAt: snapshot.createdAt,
          location: { kind: 'opfs', objectKey: `objects/${snapshot.packageAssetId}` },
          mimeType: 'application/x-sniptale-web-snapshot+zip',
          sha256: null,
          size: snapshot.size,
        };
      }
      return undefined;
    }),
  };
}
