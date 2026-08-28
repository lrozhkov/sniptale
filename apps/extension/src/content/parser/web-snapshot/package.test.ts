// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import {
  MAX_PAGE_PACKAGE_URL_BYTES,
  MAX_PAGE_PACKAGE_WARNING_BYTES,
  PAGE_PACKAGE_ARCHIVE_PATHS,
} from '@sniptale/runtime-contracts/page-package';
import { MAX_POPUP_EXPORT_TAB_TITLE_BYTES } from '@sniptale/runtime-contracts/export';
import { readPagePackageTestBlobText } from '../../../features/web-snapshot/package.test-support';
import { buildWebSnapshotPackage } from './package';
import type { WebSnapshotPageSource } from './types';

const { createImageThumbnailBlobMock } = vi.hoisted(() => ({
  createImageThumbnailBlobMock: vi.fn(),
}));

vi.mock('../../../platform/media-utils/image-thumbnail', () => ({
  createImageThumbnailBlob: createImageThumbnailBlobMock,
}));

function createSource(): WebSnapshotPageSource {
  return {
    title: 'Prepared page',
    url: 'http://localhost:3000/prepared',
    viewport: { deviceScaleFactor: 1, height: 720, width: 1280 },
  };
}

function findEntry(
  result: Awaited<ReturnType<typeof buildWebSnapshotPackage>>,
  path: string
): Blob {
  const entry = result.pagePackage.entries.find((candidate) => candidate.path === path);
  if (!entry) throw new Error(`Missing Page Package entry: ${path}`);
  return entry.source;
}

afterEach(() => {
  vi.restoreAllMocks();
  createImageThumbnailBlobMock.mockReset();
});

it('composes one safe static document, standard diagnostics, screenshot, and top thumbnail', async () => {
  const html = '<!doctype html><html><body><main>Static page</main></body></html>';
  const diagnosticsDocument = document.implementation.createHTMLDocument('Private title');
  diagnosticsDocument.body.innerHTML =
    '<main data-token="private-token">Sensitive diagnostic text</main>';
  const screenshotBlob = new Blob(['png'], { type: 'image/png' });
  const thumbnailBlob = new Blob(['webp'], { type: 'image/webp' });
  createImageThumbnailBlobMock.mockResolvedValue(thumbnailBlob);

  const result = await buildWebSnapshotPackage({
    assets: [],
    diagnosticsSource: { document: diagnosticsDocument },
    html,
    screenshotBlob,
    source: createSource(),
    warnings: ['Iframe content was unavailable'],
  });

  expect(
    await readPagePackageTestBlobText(findEntry(result, PAGE_PACKAGE_ARCHIVE_PATHS.snapshotHtml))
  ).toBe(html);
  expect(findEntry(result, PAGE_PACKAGE_ARCHIVE_PATHS.screenshot)).toBe(screenshotBlob);
  expect(findEntry(result, PAGE_PACKAGE_ARCHIVE_PATHS.thumbnail)).toBe(thumbnailBlob);
  const domDiagnostics = await readPagePackageTestBlobText(
    findEntry(result, 'diagnostics/standard/dom.html.txt')
  );
  const virtualDomDiagnostics = await readPagePackageTestBlobText(
    findEntry(result, 'diagnostics/standard/virtual-dom.html.txt')
  );
  expect(domDiagnostics).not.toBe(html);
  expect(domDiagnostics).toContain('[text:25]');
  expect(domDiagnostics).not.toContain('Sensitive diagnostic text');
  expect(domDiagnostics).not.toContain('private-token');
  expect(virtualDomDiagnostics).not.toBe(html);
  expect(virtualDomDiagnostics).not.toContain('Sensitive diagnostic text');
  expect(virtualDomDiagnostics).not.toContain('private-token');
  expect(
    await readPagePackageTestBlobText(findEntry(result, 'diagnostics/standard/errors.log'))
  ).toBe('Iframe content was unavailable');
  expect(createImageThumbnailBlobMock).toHaveBeenCalledWith(screenshotBlob, 320, 180, {
    verticalAnchor: 'top',
  });
  expect(result.manifest).toBe(result.pagePackage.manifest);
  expect(result.manifest.entries).toEqual(
    result.pagePackage.entries.map(({ source: _source, ...entry }) => entry)
  );
});

it('records asset metadata and structured capture status in the canonical manifest', async () => {
  createImageThumbnailBlobMock.mockResolvedValue(new Blob(['webp'], { type: 'image/webp' }));
  const asset = new Blob(['body { color: red; }'], { type: 'text/css' });

  const result = await buildWebSnapshotPackage({
    assets: [
      {
        blob: asset,
        localPath: 'assets/style.css',
        originalUrl: 'https://example.test/style.css',
      },
    ],
    html: '<!doctype html><html><body>Snapshot</body></html>',
    screenshotBlob: new Blob(['png'], { type: 'image/png' }),
    source: createSource(),
    warningStats: {
      failedAssetCount: 1,
      networkWarningCount: 1,
      sanitizerWarningCount: 1,
      warningCount: 2,
    },
    warnings: ['Asset skipped', 'Frame skipped'],
  });

  expect(result.manifest.entries).toContainEqual({
    component: 'webCopy',
    mimeType: 'text/css',
    path: 'assets/style.css',
    sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    size: asset.size,
  });
  expect(result.manifest.stats).toMatchObject({
    entryCount: result.pagePackage.entries.length,
    failedResourceCount: 1,
    warningCount: 2,
  });
  expect(result.manifest.components).toContainEqual(
    expect.objectContaining({ id: 'webCopy', status: 'partial' })
  );
});

it('sanitizes source provenance and preserves capture viewport metadata', async () => {
  createImageThumbnailBlobMock.mockResolvedValue(new Blob(['webp'], { type: 'image/webp' }));
  const result = await buildWebSnapshotPackage({
    assets: [],
    html: '<!doctype html><html><body>Snapshot</body></html>',
    screenshotBlob: new Blob(['png'], { type: 'image/png' }),
    source: {
      title: 'Detached snapshot',
      url: 'https://user:secret@source.example/path?token=secret#hash',
      viewport: { deviceScaleFactor: 2, height: 720, width: 1280 },
    },
    warnings: [],
  });

  expect(result.manifest.source).toEqual({
    faviconUrl: null,
    title: 'Detached snapshot',
    url: 'https://source.example/path',
  });
  expect(result.manifest.viewport).toEqual({ deviceScaleFactor: 2, height: 720, width: 1280 });
});

it('keeps direct callers inside the canonical Page Package title contract', async () => {
  createImageThumbnailBlobMock.mockResolvedValue(new Blob(['webp'], { type: 'image/webp' }));
  const result = await buildWebSnapshotPackage({
    assets: [],
    html: '<!doctype html><html><body>Snapshot</body></html>',
    screenshotBlob: new Blob(['png'], { type: 'image/png' }),
    source: {
      ...createSource(),
      title: 'e\u0301'.repeat(MAX_POPUP_EXPORT_TAB_TITLE_BYTES),
    },
    warnings: [],
  });

  const title = result.manifest.source.title;
  expect(typeof title).toBe('string');
  expect(title).toBe(title?.normalize('NFC'));
  expect(new TextEncoder().encode(title ?? '').byteLength).toBeLessThanOrEqual(
    MAX_POPUP_EXPORT_TAB_TITLE_BYTES
  );
});

it('closes direct source URLs and warnings under the manifest contract', async () => {
  createImageThumbnailBlobMock.mockResolvedValue(new Blob(['webp'], { type: 'image/webp' }));
  const result = await buildWebSnapshotPackage({
    assets: [],
    html: '<!doctype html><html><body>Snapshot</body></html>',
    screenshotBlob: new Blob(['png'], { type: 'image/png' }),
    source: {
      ...createSource(),
      url: `https://page.test/${'u'.repeat(MAX_PAGE_PACKAGE_URL_BYTES)}`,
    },
    warnings: ['e\u0301'.repeat(MAX_PAGE_PACKAGE_WARNING_BYTES)],
  });

  expect(result.manifest.source.url).toBeNull();
  expect(new TextEncoder().encode(result.manifest.warnings[0] ?? '').byteLength).toBe(
    MAX_PAGE_PACKAGE_WARNING_BYTES
  );
});

it('keeps a large canonical static document without duplicating it into diagnostics', async () => {
  createImageThumbnailBlobMock.mockResolvedValue(new Blob(['webp'], { type: 'image/webp' }));
  const html = `<!doctype html><html><body>${'x'.repeat(4 * 1024 * 1024)}</body></html>`;

  const result = await buildWebSnapshotPackage({
    assets: [],
    html,
    screenshotBlob: new Blob(['png'], { type: 'image/png' }),
    source: createSource(),
    warnings: [],
  });

  expect(
    await readPagePackageTestBlobText(findEntry(result, PAGE_PACKAGE_ARCHIVE_PATHS.snapshotHtml))
  ).toBe(html);
  const diagnostics = await readPagePackageTestBlobText(
    findEntry(result, 'diagnostics/standard/dom.html.txt')
  );
  expect(diagnostics).not.toBe(html);
  expect(diagnostics.length).toBeLessThan(1024);
});

it('rejects unsafe or oversized inputs before composition', async () => {
  createImageThumbnailBlobMock.mockResolvedValue(new Blob(['webp'], { type: 'image/webp' }));

  await expect(
    buildWebSnapshotPackage({
      assets: [],
      html: 'x'.repeat(8 * 1024 * 1024 + 1),
      screenshotBlob: new Blob(['png'], { type: 'image/png' }),
      source: createSource(),
      warnings: [],
    })
  ).rejects.toThrow('Web snapshot HTML is too large.');

  await expect(
    buildWebSnapshotPackage({
      assets: [],
      html: '<main>Snapshot</main>',
      screenshotBlob: new Blob(['webp'], { type: 'image/webp' }),
      source: createSource(),
      warnings: [],
    })
  ).rejects.toThrow('Page Package screenshot must use image/png.');
});
