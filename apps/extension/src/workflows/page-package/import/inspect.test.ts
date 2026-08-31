import JSZip from 'jszip';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  PAGE_PACKAGE_ARCHIVE_MIME_TYPE,
  PAGE_PACKAGE_ARCHIVE_PATHS,
} from '@sniptale/runtime-contracts/page-package';
import {
  createPagePackageArchiveFixture,
  createPagePackageTestBlobFromBytes,
  readPagePackageTestBlobBytes,
} from '../../../features/web-snapshot/package.test-support';
import { inspectWebSnapshotImport } from './inspect';

function asImportFile(blob: Blob, name = 'snapshot.sniptale-page-package.zip'): File {
  return new File([blob], name, { type: PAGE_PACKAGE_ARCHIVE_MIME_TYPE });
}

async function rewriteArchive(
  blob: Blob,
  mutate: (zip: JSZip) => void | Promise<void>
): Promise<File> {
  const zip = await JSZip.loadAsync(await readPagePackageTestBlobBytes(blob));
  await mutate(zip);
  return asImportFile(
    createPagePackageTestBlobFromBytes(
      await zip.generateAsync({ type: 'uint8array' }),
      PAGE_PACKAGE_ARCHIVE_MIME_TYPE
    )
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ close: vi.fn(), height: 1, width: 1 }))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('inspects an exact current standard Save Page Package without publishing it', async () => {
  const fixture = await createPagePackageArchiveFixture();

  await expect(inspectWebSnapshotImport(asImportFile(fixture.packageBlob))).resolves.toMatchObject({
    capturedAt: fixture.manifest.capturedAt,
    manifest: fixture.manifest,
    resourceCount: 0,
    sourceTitle: 'Snapshot',
    sourceUrl: 'https://example.test/',
  });
});

it('accepts a current package with an explicitly partial viewport preview', async () => {
  const base = await createPagePackageArchiveFixture();
  const fixture = await createPagePackageArchiveFixture({
    entries: base.entries.map((entry) =>
      entry.path === PAGE_PACKAGE_ARCHIVE_PATHS.screenshot
        ? { ...entry, path: PAGE_PACKAGE_ARCHIVE_PATHS.partialScreenshot }
        : entry
    ),
  });

  await expect(inspectWebSnapshotImport(asImportFile(fixture.packageBlob))).resolves.toMatchObject({
    manifest: {
      components: expect.arrayContaining([
        expect.objectContaining({ id: 'webCopy', status: 'partial' }),
      ]),
    },
  });
});

it('rejects unsupported names and Page Package profiles without fallback', async () => {
  const fixture = await createPagePackageArchiveFixture();
  await expect(
    inspectWebSnapshotImport(asImportFile(fixture.packageBlob, 'snapshot.zip'))
  ).rejects.toThrow('.sniptale-page-package.zip');

  const exported = await rewriteArchive(fixture.packageBlob, async (zip) => {
    const manifest = JSON.parse(await zip.file(PAGE_PACKAGE_ARCHIVE_PATHS.manifest)!.async('text'));
    manifest.intent = 'export';
    zip.file(PAGE_PACKAGE_ARCHIVE_PATHS.manifest, JSON.stringify(manifest));
  });
  await expect(inspectWebSnapshotImport(exported)).rejects.toThrow('standard Web Snapshot');
});

it('rejects undeclared files and digest mismatches before publication', async () => {
  const fixture = await createPagePackageArchiveFixture();
  const extra = await rewriteArchive(fixture.packageBlob, (zip) => {
    zip.file('assets/undeclared.png', new Uint8Array([1, 2, 3]), { createFolders: false });
  });
  await expect(inspectWebSnapshotImport(extra)).rejects.toThrow('inventory does not match');

  const mismatched = await rewriteArchive(fixture.packageBlob, async (zip) => {
    const manifest = JSON.parse(await zip.file(PAGE_PACKAGE_ARCHIVE_PATHS.manifest)!.async('text'));
    manifest.entries[0].sha256 = 'f'.repeat(64);
    zip.file(PAGE_PACKAGE_ARCHIVE_PATHS.manifest, JSON.stringify(manifest));
  });
  await expect(inspectWebSnapshotImport(mismatched)).rejects.toThrow('digest does not match');
});

it('rejects a declared binary MIME whose signature does not match', async () => {
  const fixture = await createPagePackageArchiveFixture();
  const corrupt = await rewriteArchive(fixture.packageBlob, async (zip) => {
    const manifest = JSON.parse(await zip.file(PAGE_PACKAGE_ARCHIVE_PATHS.manifest)!.async('text'));
    const thumbnail = manifest.entries.find(
      (entry: { path: string }) => entry.path === PAGE_PACKAGE_ARCHIVE_PATHS.thumbnail
    );
    const bytes = new TextEncoder().encode('not-webp');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    thumbnail.size = bytes.byteLength;
    thumbnail.sha256 = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
    const component = manifest.components.find((entry: { id: string }) => entry.id === 'webCopy');
    component.totalBytes = manifest.entries
      .filter((entry: { component: string }) => entry.component === 'webCopy')
      .reduce((total: number, entry: { size: number }) => total + entry.size, 0);
    manifest.stats.totalBytes = manifest.entries.reduce(
      (total: number, entry: { size: number }) => total + entry.size,
      0
    );
    zip.file(PAGE_PACKAGE_ARCHIVE_PATHS.thumbnail, bytes);
    zip.file(PAGE_PACKAGE_ARCHIVE_PATHS.manifest, JSON.stringify(manifest));
  });
  await expect(inspectWebSnapshotImport(corrupt)).rejects.toThrow('MIME signature');
});

it('rejects hostile thumbnail geometry before allocating its decoded raster', async () => {
  const fixture = await createPagePackageArchiveFixture();
  const hostile = await rewriteArchive(fixture.packageBlob, async (zip) => {
    const manifest = JSON.parse(await zip.file(PAGE_PACKAGE_ARCHIVE_PATHS.manifest)!.async('text'));
    const thumbnail = manifest.entries.find(
      (entry: { path: string }) => entry.path === PAGE_PACKAGE_ARCHIVE_PATHS.thumbnail
    );
    const bytes = new Uint8Array(30);
    bytes.set(new TextEncoder().encode('RIFF'), 0);
    bytes.set(new TextEncoder().encode('WEBPVP8X'), 8);
    bytes.set([0x00, 0x80, 0x00], 24);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    thumbnail.size = bytes.byteLength;
    thumbnail.sha256 = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
    const component = manifest.components.find((entry: { id: string }) => entry.id === 'webCopy');
    component.totalBytes = manifest.entries
      .filter((entry: { component: string }) => entry.component === 'webCopy')
      .reduce((total: number, entry: { size: number }) => total + entry.size, 0);
    manifest.stats.totalBytes = manifest.entries.reduce(
      (total: number, entry: { size: number }) => total + entry.size,
      0
    );
    zip.file(PAGE_PACKAGE_ARCHIVE_PATHS.thumbnail, bytes);
    zip.file(PAGE_PACKAGE_ARCHIVE_PATHS.manifest, JSON.stringify(manifest));
  });

  await expect(inspectWebSnapshotImport(hostile)).rejects.toThrow('dimensions exceed safe limits');
  expect(createImageBitmap).toHaveBeenCalledTimes(1);
});
