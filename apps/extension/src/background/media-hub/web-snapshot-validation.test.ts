import JSZip from 'jszip';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  PAGE_PACKAGE_ARCHIVE_MIME_TYPE,
  PAGE_PACKAGE_ARCHIVE_PATHS,
  PAGE_PACKAGE_EXTENDED_DIAGNOSTIC_ENTRY_PROFILE,
} from '@sniptale/runtime-contracts/page-package';
import type {
  WebSnapshotManifest,
  WebSnapshotSaveToGalleryPayload,
} from '@sniptale/runtime-contracts/web-snapshot';
import {
  createPagePackageArchiveFixture,
  createPagePackageTestBlobFromBytes,
  readPagePackageTestBlobBytes,
  type PagePackageFixtureEntry,
} from '../../features/web-snapshot/package.test-support';
import { createPagePackageManifestFixture } from '../../features/web-snapshot/manifest.test-support';
import { validateWebSnapshotPackage } from './web-snapshot-validation';

const validateRetainedScreenshotMock = vi.hoisted(() => vi.fn());

vi.mock('../../features/web-snapshot/screenshot-validation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/web-snapshot/screenshot-validation')>()),
  validateRetainedWebSnapshotScreenshot: validateRetainedScreenshotMock,
}));

beforeEach(() => {
  validateRetainedScreenshotMock.mockReset();
  validateRetainedScreenshotMock.mockResolvedValue({ height: 720, width: 1280 });
});

function createPayload(manifest: WebSnapshotManifest): WebSnapshotSaveToGalleryPayload {
  return {
    manifest,
    packageStagedBlobId: 'package-stage-1',
    screenshotMimeType: 'image/png',
    screenshotStagedBlobId: 'screenshot-stage-1',
    snapshotSessionId: 'snapshot-session-1',
  };
}

async function createArchiveWithManifest(
  entries: readonly PagePackageFixtureEntry[],
  manifestText: string,
  extra?: { path: string; value: string }
): Promise<Blob> {
  const zip = new JSZip();
  for (const entry of entries) {
    zip.file(entry.path, await readPagePackageTestBlobBytes(entry.blob), {
      createFolders: false,
    });
  }
  zip.file(PAGE_PACKAGE_ARCHIVE_PATHS.manifest, manifestText, { createFolders: false });
  if (extra) zip.file(extra.path, extra.value, { createFolders: false });
  const blob = await zip.generateAsync({ type: 'uint8array' });
  return createPagePackageTestBlobFromBytes(blob, PAGE_PACKAGE_ARCHIVE_MIME_TYPE);
}

it('accepts an exact Page Package and retained screenshot pair', async () => {
  const fixture = await createPagePackageArchiveFixture();
  await expect(
    validateWebSnapshotPackage({
      packageBlob: fixture.packageBlob,
      payload: createPayload(fixture.manifest),
      screenshotBlob: fixture.screenshotBlob,
    })
  ).resolves.toBeUndefined();
});

it('accepts a Save Web-copy when the user selected no diagnostic component', async () => {
  const base = await createPagePackageArchiveFixture();
  const fixture = await createPagePackageArchiveFixture({
    entries: base.entries.filter((entry) => entry.component !== 'diagnostics'),
  });

  await expect(
    validateWebSnapshotPackage({
      packageBlob: fixture.packageBlob,
      payload: createPayload(fixture.manifest),
      screenshotBlob: fixture.screenshotBlob,
    })
  ).resolves.toBeUndefined();
});

it('accepts Save packages enriched by retained Export Manager components', async () => {
  const fixture = await createPagePackageArchiveFixture({
    entries: [
      ...(await createPagePackageArchiveFixture()).entries,
      {
        blob: new Blob(['{"ok":true}'], { type: 'application/json' }),
        component: 'pageData',
        path: 'exports/data/page.json',
      },
      {
        blob: new Blob(['attachment'], { type: 'text/plain' }),
        component: 'attachments',
        path: 'attachments/readme.txt',
      },
    ],
  });

  await expect(
    validateWebSnapshotPackage({
      packageBlob: fixture.packageBlob,
      payload: createPayload(fixture.manifest),
      screenshotBlob: fixture.screenshotBlob,
    })
  ).resolves.toBeUndefined();
});

it('accepts asset-rich packages beyond the former preview-only file ceiling', async () => {
  const base = await createPagePackageArchiveFixture();
  const fixture = await createPagePackageArchiveFixture({
    entries: [
      ...base.entries,
      ...Array.from({ length: 501 }, (_, index) => ({
        blob: new Blob([String(index)], { type: 'image/png' }),
        component: 'webCopy' as const,
        path: `assets/images/asset-${index}.png`,
      })),
    ],
  });

  await expect(
    validateWebSnapshotPackage({
      packageBlob: fixture.packageBlob,
      payload: createPayload(fixture.manifest),
      screenshotBlob: fixture.screenshotBlob,
    })
  ).resolves.toBeUndefined();
});

it('accepts explicitly selected inert extended page data in a Library package', async () => {
  const base = await createPagePackageArchiveFixture();
  const entries = [
    ...base.entries.filter((entry) => entry.component !== 'diagnostics'),
    ...PAGE_PACKAGE_EXTENDED_DIAGNOSTIC_ENTRY_PROFILE.map((entry) => ({
      blob: new Blob([entry.mimeType === 'application/json' ? '{}\n' : '<html>evidence</html>'], {
        type: entry.mimeType,
      }),
      component: 'diagnostics' as const,
      path: entry.path,
    })),
  ];
  const fixture = await createPagePackageArchiveFixture({
    entries,
    manifest: { diagnosticsLevel: 'extended' },
  });

  await expect(
    validateWebSnapshotPackage({
      packageBlob: fixture.packageBlob,
      payload: createPayload(fixture.manifest),
      screenshotBlob: fixture.screenshotBlob,
    })
  ).resolves.toBeUndefined();
});

it('rejects Save packages without the retained safe Web-copy profile', async () => {
  const fixture = await createPagePackageArchiveFixture({
    entries: [
      {
        blob: new Blob(['screenshot'], { type: 'image/png' }),
        component: 'images',
        path: PAGE_PACKAGE_ARCHIVE_PATHS.screenshot,
      },
      {
        blob: new Blob([''], { type: 'text/plain' }),
        component: 'diagnostics',
        path: 'diagnostics/standard/errors.log',
      },
    ],
  });

  await expect(
    validateWebSnapshotPackage({
      packageBlob: fixture.packageBlob,
      payload: createPayload(fixture.manifest),
      screenshotBlob: fixture.screenshotBlob,
    })
  ).rejects.toThrow('Saved Page Package profile is invalid');
});

it('rejects malformed and non-Page-Package root manifests', async () => {
  const fixture = await createPagePackageArchiveFixture();
  await expect(
    validateWebSnapshotPackage({
      packageBlob: await createArchiveWithManifest(fixture.entries, '{'),
      payload: createPayload(fixture.manifest),
      screenshotBlob: fixture.screenshotBlob,
    })
  ).rejects.toThrow();
  await expect(
    validateWebSnapshotPackage({
      packageBlob: await createArchiveWithManifest(
        fixture.entries,
        JSON.stringify({ schemaVersion: 1 })
      ),
      payload: createPayload(fixture.manifest),
      screenshotBlob: fixture.screenshotBlob,
    })
  ).rejects.toThrow('Page Package manifest is invalid');
});

it('rejects payload identity drift and undeclared archive entries', async () => {
  const fixture = await createPagePackageArchiveFixture();
  const other = await createPagePackageArchiveFixture({ manifest: { id: 'snapshot-2' } });
  await expect(
    validateWebSnapshotPackage({
      packageBlob: fixture.packageBlob,
      payload: createPayload(other.manifest),
      screenshotBlob: fixture.screenshotBlob,
    })
  ).rejects.toThrow('does not match payload manifest');
  await expect(
    validateWebSnapshotPackage({
      packageBlob: await createArchiveWithManifest(
        fixture.entries,
        JSON.stringify(fixture.manifest),
        { path: 'assets/undeclared.png', value: 'extra' }
      ),
      payload: createPayload(fixture.manifest),
      screenshotBlob: fixture.screenshotBlob,
    })
  ).rejects.toThrow('inventory does not match');
});

it('rejects active Web-copy MIME types at save admission', async () => {
  const fixture = await createPagePackageArchiveFixture();
  const hostileEntry: PagePackageFixtureEntry = {
    blob: new Blob(['payload'], { type: 'text/html' }),
    component: 'webCopy',
    path: 'assets/payload.html',
  };
  const hostileManifest = createPagePackageManifestFixture({
    entries: [
      ...fixture.manifest.entries,
      {
        component: 'webCopy',
        mimeType: 'text/html',
        path: hostileEntry.path,
        sha256: '0'.repeat(64),
        size: hostileEntry.blob.size,
      },
    ],
  });

  await expect(
    validateWebSnapshotPackage({
      packageBlob: await createArchiveWithManifest(
        [...fixture.entries, hostileEntry],
        JSON.stringify(hostileManifest)
      ),
      payload: createPayload(hostileManifest),
      screenshotBlob: fixture.screenshotBlob,
    })
  ).rejects.toThrow('Page Package manifest is invalid.');
});

it('rejects digest drift before screenshot publication', async () => {
  const fixture = await createPagePackageArchiveFixture();
  const changedEntries = fixture.entries.map((entry) =>
    entry.path === PAGE_PACKAGE_ARCHIVE_PATHS.snapshotHtml
      ? { ...entry, blob: new Blob(['x'.repeat(entry.blob.size)], { type: 'text/html' }) }
      : entry
  );
  await expect(
    validateWebSnapshotPackage({
      packageBlob: await createArchiveWithManifest(
        changedEntries,
        JSON.stringify(fixture.manifest)
      ),
      payload: createPayload(fixture.manifest),
      screenshotBlob: fixture.screenshotBlob,
    })
  ).rejects.toThrow('entry digest does not match');
});

it('rejects unsanitized provenance and a retained screenshot mismatch', async () => {
  const unsanitized = await createPagePackageArchiveFixture({
    manifest: {
      source: {
        faviconUrl: null,
        title: 'Private',
        url: 'https://user:secret@example.test/path?token=secret',
      },
    },
  });
  await expect(
    validateWebSnapshotPackage({
      packageBlob: unsanitized.packageBlob,
      payload: createPayload(unsanitized.manifest),
      screenshotBlob: unsanitized.screenshotBlob,
    })
  ).rejects.toThrow('provenance is not sanitized');

  const fixture = await createPagePackageArchiveFixture();
  validateRetainedScreenshotMock.mockRejectedValueOnce(new Error('retained screenshot mismatch'));
  await expect(
    validateWebSnapshotPackage({
      packageBlob: fixture.packageBlob,
      payload: createPayload(fixture.manifest),
      screenshotBlob: new Blob(['different'], { type: 'image/png' }),
    })
  ).rejects.toThrow('retained screenshot mismatch');
});
