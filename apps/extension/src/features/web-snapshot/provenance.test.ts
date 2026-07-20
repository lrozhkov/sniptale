import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { createWebSnapshotManifest, WEB_SNAPSHOT_PACKAGE_PATHS } from './manifest';
import { sanitizeWebSnapshotPackageProvenance } from './provenance';

describe('web snapshot package provenance sanitizer', () => {
  it('rejects sanitized output packages that exceed the persisted byte budget', async () => {
    const packageBlob = await createPackageBlob();

    await expect(
      sanitizeWebSnapshotPackageProvenance(packageBlob, undefined, {
        maxPackageBytes: packageBlob.size,
      })
    ).rejects.toThrow('Web snapshot package is too large.');
  });

  it('preserves non-provenance package manifest metadata when an override is provided', async () => {
    const packageManifest = createAssetManifest();
    const packageBlob = await createPackageBlob(packageManifest);
    const override = createWebSnapshotManifest({
      id: 'snapshot-1',
      source: {
        faviconUrl: 'https://example.com/favicon.ico?token=secret',
        title: 'Snapshot',
        url: 'https://example.com/reset-password/override?token=secret',
      },
    });

    const result = await sanitizeWebSnapshotPackageProvenance(packageBlob, override);
    const zip = await JSZip.loadAsync(await result.packageBlob.arrayBuffer());
    const manifestText = await zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.manifest)?.async('string');
    const nestedManifest = JSON.parse(manifestText ?? '{}');

    expect(nestedManifest.assets).toEqual(packageManifest.assets);
    expect(nestedManifest.stats).toEqual({
      ...packageManifest.stats,
      packageSize: result.packageBlob.size,
    });
    expect(result.manifest.stats.packageSize).toBe(result.packageBlob.size);
    expect(nestedManifest.warnings).toEqual(packageManifest.warnings);
    expect(nestedManifest.source).toEqual({
      faviconUrl: 'https://example.com/favicon.ico',
      title: 'Snapshot',
      url: 'https://example.com/',
    });
  });
});

describe('web snapshot package size metadata', () => {
  it('normalizes returned manifest size when package provenance is unchanged', async () => {
    const packageManifest = createAssetManifest();
    const packageBlob = await createPackageBlob(packageManifest);

    const result = await sanitizeWebSnapshotPackageProvenance(packageBlob);

    expect(result.changed).toBe(true);
    expect(result.size).toBe(result.packageBlob.size);
    expect(result.manifest.stats.packageSize).toBe(result.packageBlob.size);
  });
});

function createAssetManifest() {
  return createWebSnapshotManifest({
    assets: [
      {
        mimeType: 'image/png',
        path: 'assets/image.png',
        sha256: 'a'.repeat(64),
        size: 12,
      },
    ],
    id: 'snapshot-1',
    source: {
      faviconUrl: null,
      title: 'Snapshot',
      url: 'https://example.com/page',
    },
    stats: { assetCount: 1, failedAssetCount: 0, packageSize: 42 },
    warnings: ['kept warning'],
  });
}

async function createPackageBlob(
  packageManifest?: ReturnType<typeof createAssetManifest>
): Promise<Blob> {
  const manifest = createWebSnapshotManifest({
    id: 'snapshot-1',
    source: {
      faviconUrl: null,
      title: 'Snapshot',
      url: 'https://example.com/page',
    },
  });
  const rawManifest = packageManifest ?? {
    ...manifest,
    source: {
      faviconUrl: null,
      title: 'Snapshot',
      url: 'https://user:pass@example.com/reset-password/abc?token=secret#hash',
    },
  };
  const zip = new JSZip();
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.manifest, JSON.stringify(rawManifest));
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.snapshotHtml, '<main></main>');
  return zip.generateAsync({ type: 'blob' });
}
