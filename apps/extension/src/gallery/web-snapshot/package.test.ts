import JSZip from 'jszip';
import { expect, it } from 'vitest';
import {
  PAGE_PACKAGE_ARCHIVE_MIME_TYPE,
  PAGE_PACKAGE_ARCHIVE_PATHS,
} from '@sniptale/runtime-contracts/page-package';
import {
  createPagePackageArchiveFixture,
  createPagePackageTestBlobFromBytes,
  readPagePackageTestBlobBytes,
  type PagePackageFixtureEntry,
} from '../../features/web-snapshot/package.test-support';
import { loadWebSnapshotScreenshotBlob } from './package';

it('loads the verified full-page screenshot from a Page Package', async () => {
  const fixture = await createPagePackageArchiveFixture();

  const screenshot = await loadWebSnapshotScreenshotBlob(fixture.packageBlob);

  expect(screenshot.type).toBe('image/png');
  expect(await readPagePackageTestBlobBytes(screenshot)).toEqual(
    await readPagePackageTestBlobBytes(fixture.screenshotBlob)
  );
});

it('loads an explicitly declared visible-area preview without treating it as page-screenshot.png', async () => {
  const base = await createPagePackageArchiveFixture();
  const entries = base.entries.map((entry) =>
    entry.path === PAGE_PACKAGE_ARCHIVE_PATHS.screenshot
      ? { ...entry, path: PAGE_PACKAGE_ARCHIVE_PATHS.partialScreenshot }
      : entry
  );
  const fixture = await createPagePackageArchiveFixture({ entries });

  await expect(loadWebSnapshotScreenshotBlob(fixture.packageBlob)).resolves.toBeInstanceOf(Blob);
  expect(fixture.manifest.entries.map((entry) => entry.path)).not.toContain(
    PAGE_PACKAGE_ARCHIVE_PATHS.screenshot
  );
});

it('accepts declared nested assets and diagnostic entries', async () => {
  const base = await createPagePackageArchiveFixture();
  const entries: PagePackageFixtureEntry[] = [
    ...base.entries,
    {
      blob: new Blob(['body { color: red; }'], { type: 'text/css' }),
      component: 'webCopy',
      path: 'assets/styles/document.css',
    },
    {
      blob: new Blob(['diagnostic'], { type: 'text/plain' }),
      component: 'diagnostics',
      path: 'diagnostics/standard/styles/document.css.txt',
    },
  ];
  const fixture = await createPagePackageArchiveFixture({ entries });

  await expect(loadWebSnapshotScreenshotBlob(fixture.packageBlob)).resolves.toBeInstanceOf(Blob);
});

it('rejects packages without a valid manifest and screenshot declaration', async () => {
  const zip = new JSZip();
  zip.file(PAGE_PACKAGE_ARCHIVE_PATHS.screenshot, 'png');
  const raw = await zip.generateAsync({ type: 'uint8array' });
  const packageBlob = createPagePackageTestBlobFromBytes(raw, PAGE_PACKAGE_ARCHIVE_MIME_TYPE);

  await expect(loadWebSnapshotScreenshotBlob(packageBlob)).rejects.toThrow(
    'Page Package manifest is missing.'
  );
});

it('rejects undeclared archive entries', async () => {
  const fixture = await createPagePackageArchiveFixture();
  const zip = await JSZip.loadAsync(await readPagePackageTestBlobBytes(fixture.packageBlob));
  zip.file('assets/undeclared.png', 'png', { createFolders: false });
  const raw = await zip.generateAsync({ type: 'uint8array' });

  await expect(
    loadWebSnapshotScreenshotBlob(
      createPagePackageTestBlobFromBytes(raw, PAGE_PACKAGE_ARCHIVE_MIME_TYPE)
    )
  ).rejects.toThrow('Page Package archive inventory does not match its manifest.');
});

it('rejects screenshot content whose digest differs from the manifest', async () => {
  const fixture = await createPagePackageArchiveFixture();
  const zip = await JSZip.loadAsync(await readPagePackageTestBlobBytes(fixture.packageBlob));
  zip.file(PAGE_PACKAGE_ARCHIVE_PATHS.screenshot, 'different');
  const raw = await zip.generateAsync({ type: 'uint8array' });

  await expect(
    loadWebSnapshotScreenshotBlob(
      createPagePackageTestBlobFromBytes(raw, PAGE_PACKAGE_ARCHIVE_MIME_TYPE)
    )
  ).rejects.toThrow(/inventory does not match|metadata does not match/u);
});
