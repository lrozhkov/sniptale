import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { PAGE_PACKAGE_ARCHIVE_MIME_TYPE } from '@sniptale/runtime-contracts/page-package';
import { WEB_SNAPSHOT_PACKAGE_PATHS } from './manifest';
import {
  createPagePackageArchiveFixture,
  createPagePackageTestBlobFromBytes,
  readPagePackageTestBlobBytes,
} from './package.test-support';
import { createPagePackageManifestFixture } from './manifest.test-support';
import { sanitizeWebSnapshotPackageProvenance } from './provenance';

describe('Page Package provenance sanitizer', () => {
  it('preserves the exact archive when provenance is already safe', async () => {
    const fixture = await createPagePackageArchiveFixture();

    const result = await sanitizeWebSnapshotPackageProvenance(fixture.packageBlob);

    expect(result.changed).toBe(false);
    expect(result.packageBlob).toBe(fixture.packageBlob);
    expect(result.manifest).toEqual(fixture.manifest);
    expect(result.size).toBe(fixture.packageBlob.size);
  });

  it('rewrites only source provenance while preserving entries, stats, and warnings', async () => {
    const fixture = await createPagePackageArchiveFixture({
      manifest: { warnings: ['kept warning'] },
    });
    const override = createPagePackageManifestFixture({
      ...fixture.manifest,
      source: {
        faviconUrl: 'https://example.com/favicon.ico?token=secret',
        title: 'Snapshot',
        url: 'https://user:secret@example.com/reset-password/override?token=secret',
      },
    });

    const result = await sanitizeWebSnapshotPackageProvenance(fixture.packageBlob, override);
    const zip = await JSZip.loadAsync(await readPagePackageTestBlobBytes(result.packageBlob));
    const manifestText = await zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.manifest)?.async('string');
    const nestedManifest = JSON.parse(manifestText ?? '{}');

    expect(result.changed).toBe(true);
    expect(nestedManifest.entries).toEqual(fixture.manifest.entries);
    expect(nestedManifest.stats).toEqual(fixture.manifest.stats);
    expect(nestedManifest.warnings).toEqual(fixture.manifest.warnings);
    expect(nestedManifest.source).toEqual({
      faviconUrl: 'https://example.com/favicon.ico',
      title: 'Snapshot',
      url: 'https://example.com/',
    });
  });

  it('rejects a supplied manifest that does not match strict archive metadata', async () => {
    const fixture = await createPagePackageArchiveFixture();
    const mismatched = createPagePackageManifestFixture({
      ...fixture.manifest,
      id: 'different-snapshot',
    });

    await expect(
      sanitizeWebSnapshotPackageProvenance(fixture.packageBlob, mismatched, {
        requireManifestMatch: true,
      })
    ).rejects.toThrow('does not match archive metadata');
  });

  it('rejects undeclared package paths', async () => {
    const fixture = await createPagePackageArchiveFixture();
    const zip = await JSZip.loadAsync(await readPagePackageTestBlobBytes(fixture.packageBlob));
    zip.file('scripts/payload.js', 'alert(1)', { createFolders: false });
    const raw = await zip.generateAsync({ type: 'uint8array' });

    await expect(
      sanitizeWebSnapshotPackageProvenance(
        createPagePackageTestBlobFromBytes(raw, PAGE_PACKAGE_ARCHIVE_MIME_TYPE)
      )
    ).rejects.toThrow('archive inventory does not match its manifest');
  });

  it('rejects same-size entry tampering by digest', async () => {
    const fixture = await createPagePackageArchiveFixture();
    const zip = await JSZip.loadAsync(await readPagePackageTestBlobBytes(fixture.packageBlob));
    zip.file('snapshot/index.html', '<!doctype html><main>Tampered</main>', {
      createFolders: false,
    });
    const raw = await zip.generateAsync({ type: 'uint8array' });

    await expect(
      sanitizeWebSnapshotPackageProvenance(
        createPagePackageTestBlobFromBytes(raw, PAGE_PACKAGE_ARCHIVE_MIME_TYPE)
      )
    ).rejects.toThrow('Page Package entry digest does not match: snapshot/index.html.');
  });

  it('enforces the configured persisted package byte budget', async () => {
    const fixture = await createPagePackageArchiveFixture();

    await expect(
      sanitizeWebSnapshotPackageProvenance(fixture.packageBlob, undefined, {
        maxPackageBytes: fixture.packageBlob.size - 1,
      })
    ).rejects.toThrow('Web snapshot package is too large.');
  });
});
