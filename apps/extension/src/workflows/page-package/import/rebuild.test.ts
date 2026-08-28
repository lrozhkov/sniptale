// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { PAGE_PACKAGE_ARCHIVE_PATHS } from '@sniptale/runtime-contracts/page-package';
import {
  createPagePackageArchiveFixture,
  createPagePackagePngBytes,
  createPagePackageTestBlobFromBytes,
  readPagePackageTestBlobText,
} from '../../../features/web-snapshot/package.test-support';
import { rebuildWebSnapshotImport } from './rebuild';

const thumbnailBytes = new Uint8Array(30);
thumbnailBytes.set(new TextEncoder().encode('RIFF'), 0);
thumbnailBytes.set(new TextEncoder().encode('WEBPVP8X'), 8);

vi.mock('../../../platform/media-utils/image-thumbnail', () => ({
  createImageThumbnailBlob: vi.fn(async () =>
    createPagePackageTestBlobFromBytes(thumbnailBytes, 'image/webp')
  ),
}));

function fileFrom(blob: Blob): File {
  return new File([blob], 'snapshot.sniptale-page-package.zip', { type: blob.type });
}

function entrySource(
  result: Awaited<ReturnType<typeof rebuildWebSnapshotImport>>,
  path: string
): Blob {
  const entry = result.pagePackage.entries.find((candidate) => candidate.path === path);
  if (!entry) throw new Error(`Missing rebuilt entry: ${path}`);
  return entry.source;
}

beforeEach(() => {
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('File', NodeFile);
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ close: vi.fn(), height: 1, width: 1 }))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('re-sanitizes active Web-copy content and rebuilds metadata under a new local ID', async () => {
  const entries = [
    {
      blob: new Blob(
        [
          '<!doctype html><html><head>',
          '<link rel="stylesheet" href="../assets/style.css">',
          '</head><body onload="steal()"><script>steal()</script>',
          '<iframe srcdoc="<script>steal()</script>"></iframe>',
          '<form action="https://evil.test/"><input name="q"><button>Go</button></form>',
          '<img src="../assets/pixel.png" onerror="steal()">',
          '<img src="https://evil.test/tracker.png">',
          '<a href="https://example.test/next">Next</a>',
          '</body></html>',
        ],
        { type: 'text/html' }
      ),
      component: 'webCopy' as const,
      path: PAGE_PACKAGE_ARCHIVE_PATHS.snapshotHtml,
    },
    {
      blob: createPagePackageTestBlobFromBytes(createPagePackagePngBytes(), 'image/png'),
      component: 'webCopy' as const,
      path: PAGE_PACKAGE_ARCHIVE_PATHS.screenshot,
    },
    {
      blob: createPagePackageTestBlobFromBytes(thumbnailBytes, 'image/webp'),
      component: 'webCopy' as const,
      path: PAGE_PACKAGE_ARCHIVE_PATHS.thumbnail,
    },
    {
      blob: new Blob(['@import "https://evil.test/a.css"; .x{background:url("pixel.png")}'], {
        type: 'text/css',
      }),
      component: 'webCopy' as const,
      path: 'assets/style.css',
    },
    {
      blob: createPagePackageTestBlobFromBytes(createPagePackagePngBytes(), 'image/png'),
      component: 'webCopy' as const,
      path: 'assets/pixel.png',
    },
    {
      blob: new Blob(
        [
          '<svg xmlns="http://www.w3.org/2000/svg"><script>steal()</script><rect onclick="steal()"/></svg>',
        ],
        { type: 'image/svg+xml' }
      ),
      component: 'webCopy' as const,
      path: 'assets/icon.svg',
    },
    {
      blob: new Blob(['diagnostic'], { type: 'text/plain' }),
      component: 'diagnostics' as const,
      path: 'diagnostics/standard/errors.log',
    },
  ];
  const fixture = await createPagePackageArchiveFixture({
    entries,
    manifest: {
      id: 'untrusted-imported-id',
      source: {
        faviconUrl: 'javascript:alert(1)',
        title: 'Imported snapshot',
        url: 'https://example.test/',
      },
    },
  });

  const rebuilt = await rebuildWebSnapshotImport(fileFrom(fixture.packageBlob));
  const html = await readPagePackageTestBlobText(
    entrySource(rebuilt, PAGE_PACKAGE_ARCHIVE_PATHS.snapshotHtml)
  );
  const css = await readPagePackageTestBlobText(entrySource(rebuilt, 'assets/style.css'));
  const svg = await readPagePackageTestBlobText(entrySource(rebuilt, 'assets/icon.svg'));

  expect(rebuilt.localId).not.toBe('untrusted-imported-id');
  expect(rebuilt.pagePackage.manifest.id).toBe(rebuilt.localId);
  expect(rebuilt.pagePackage.manifest.source.faviconUrl).toBeNull();
  expect(rebuilt.pagePackage.manifest.warnings).toContain(
    'Imported Web Snapshot content was re-sanitized by Sniptale.'
  );
  expect(html).not.toMatch(/<script|<iframe|onload|onerror|srcdoc|<form/iu);
  expect(html).not.toContain('evil.test/tracker.png');
  expect(html).toContain('src="assets/pixel.png"');
  expect(html).toContain('data-sniptale-external-href="https://example.test/next"');
  expect(css).not.toContain('evil.test');
  expect(css).toContain('assets/pixel.png');
  expect(svg).not.toMatch(/script|onclick/iu);
  expect(rebuilt.pagePackage.entries.find((entry) => entry.path === 'README.md')).toBeDefined();
});

it('creates independent local identities for repeated imports', async () => {
  const fixture = await createPagePackageArchiveFixture();
  const [first, second] = await Promise.all([
    rebuildWebSnapshotImport(fileFrom(fixture.packageBlob)),
    rebuildWebSnapshotImport(fileFrom(fixture.packageBlob)),
  ]);
  expect(first.localId).not.toBe(second.localId);
});
