import { expect, it, vi } from 'vitest';
import { createArchiveMemorySink } from '../../composition/archive-transfer/test-support';
import { openArchiveReader } from '../../composition/archive-transfer/reader';
import type { ComposedPagePackage } from './composer';
import { PAGE_PACKAGE_MANIFEST_PATH, writePagePackageArchive } from './archive';

function createPackage(): ComposedPagePackage<Blob> {
  const html = new Blob(['<main>Saved</main>'], { type: 'text/html' });
  const screenshot = new Blob(['png'], { type: 'image/png' });
  const thumbnail = new Blob(['webp'], { type: 'image/webp' });
  const entries = [
    {
      component: 'webCopy' as const,
      mimeType: 'text/html',
      path: 'snapshot/index.html',
      sha256: 'a'.repeat(64),
      size: html.size,
      source: html,
    },
    {
      component: 'webCopy' as const,
      mimeType: 'image/png',
      path: 'page-screenshot.png',
      sha256: 'b'.repeat(64),
      size: screenshot.size,
      source: screenshot,
    },
    {
      component: 'webCopy' as const,
      mimeType: 'image/webp',
      path: 'thumbnail.webp',
      sha256: 'c'.repeat(64),
      size: thumbnail.size,
      source: thumbnail,
    },
  ];
  const manifest = {
    schemaVersion: 1 as const,
    kind: 'page-package' as const,
    id: 'page-1',
    capturedAt: '2026-08-27T00:00:00.000Z',
    intent: 'save' as const,
    source: { faviconUrl: null, title: 'Saved', url: 'https://example.test/' },
    viewport: { deviceScaleFactor: 1, height: 720, width: 1280 },
    diagnosticsLevel: 'none' as const,
    components: [
      {
        id: 'webCopy' as const,
        status: 'complete' as const,
        entryCount: entries.length,
        totalBytes: entries.reduce((total, entry) => total + entry.size, 0),
      },
    ],
    entries: entries.map(({ source: _source, ...entry }) => entry),
    warnings: [],
    stats: {
      entryCount: entries.length,
      failedResourceCount: 0,
      totalBytes: entries.reduce((total, entry) => total + entry.size, 0),
      warningCount: 0,
    },
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  return {
    entries,
    manifest,
    manifestBytes: new TextEncoder().encode(manifestText),
    manifestSha256: 'd'.repeat(64),
    manifestText,
  };
}

it('streams every declared entry and the root manifest exactly once', async () => {
  const output = createArchiveMemorySink();
  const progress = vi.fn();
  const pagePackage = createPackage();

  await writePagePackageArchive({ onProgress: progress, package: pagePackage, sink: output.sink });

  const reader = await openArchiveReader(output.blob());
  expect(reader.entries().map((entry) => entry.path)).toEqual([
    'snapshot/index.html',
    'page-screenshot.png',
    'thumbnail.webp',
    PAGE_PACKAGE_MANIFEST_PATH,
  ]);
  await expect(reader.entry('snapshot/index.html')?.text()).resolves.toBe('<main>Saved</main>');
  await expect(reader.entry(PAGE_PACKAGE_MANIFEST_PATH)?.text()).resolves.toBe(
    pagePackage.manifestText
  );
  expect(progress).toHaveBeenLastCalledWith({
    bytesComplete:
      pagePackage.manifestBytes.byteLength +
      pagePackage.entries.reduce((total, entry) => total + entry.size, 0),
    entriesComplete: 4,
    entriesTotal: 4,
    path: PAGE_PACKAGE_MANIFEST_PATH,
  });
  await reader.close();
});

it('aborts the output when a source no longer matches the composed manifest', async () => {
  const output = createArchiveMemorySink();
  const pagePackage = createPackage();
  const invalidPackage = {
    ...pagePackage,
    entries: [{ ...pagePackage.entries[0]!, size: pagePackage.entries[0]!.size + 1 }],
  };

  await expect(
    writePagePackageArchive({ package: invalidPackage, sink: output.sink })
  ).rejects.toThrow('source does not match');
  expect(output.aborted).toBe(true);
});
