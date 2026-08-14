import { expect, it } from 'vitest';
import JSZip from 'jszip';

import type { ExportOptions } from '@sniptale/runtime-contracts/export';
import { createPopupExportJobArchive, createPopupExportJobResult } from './archive';

const options: ExportOptions = {
  includeBasicLogs: false,
  includeCssDiagnostics: false,
  includeFiles: false,
  includeFullPageScreenshot: true,
  includeImages: false,
  includeJson: true,
  includeMarkdown: true,
  includePageDiagnostics: false,
};

function pagePackage(title: string, errors: string[] = []) {
  return {
    pagePackage: {
      archiveBaseName: 'page',
      entries: [
        { path: 'page.json', textContent: '{}' },
        { path: 'page.md', textContent: '# Page' },
        { path: 'browser-annotations.md', textContent: 'notes' },
        { path: 'page-screenshot.png', binaryBase64: 'aGVsbG8=', mimeType: 'image/png' },
        { path: 'logs/errors.log', textContent: 'error' },
        { path: 'logs/dom.html', textContent: '<html></html>' },
      ],
      errors,
      stats: { filesCount: 2, filesFailed: 1, rowsCount: 3, sectionsCount: 4 },
    },
    tab: { tabId: title === 'One' ? 1 : 2, title },
  };
}

it('builds flat archives with unique names and every supported entry kind', async () => {
  const archive = await createPopupExportJobArchive({
    isCancelled: () => false,
    options,
    packages: [pagePackage('One'), pagePackage('Two')],
  });
  const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());

  expect(archive.filename).toMatch(/^pages_export_.+\.zip$/u);
  expect(archive.blob.type).toBe('application/zip');
  expect(Object.keys(zip.files)).toEqual(
    expect.arrayContaining([
      'page.json',
      'page.md',
      'page_annotations.md',
      'page_screenshot.png',
      'page_errors.log',
      'page/logs/dom.html',
      'page_1.json',
    ])
  );
});

it('groups package files when transferred assets are included and stops on cancellation', async () => {
  const archive = await createPopupExportJobArchive({
    isCancelled: () => false,
    options: { ...options, includeFiles: true },
    packages: [pagePackage('One')],
  });
  const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());
  expect(Object.keys(zip.files)).toContain('page/page.json');

  await expect(
    createPopupExportJobArchive({
      isCancelled: () => true,
      options,
      packages: [pagePackage('One')],
    })
  ).rejects.toThrow('Popup export cancelled');
});

it('aggregates package stats and reflects partial errors', () => {
  expect(
    createPopupExportJobResult({
      errors: ['failed'],
      filename: 'pages.zip',
      packages: [pagePackage('One'), pagePackage('Two')],
      warnings: ['warning'],
    })
  ).toEqual({
    success: false,
    filename: 'pages.zip',
    errors: ['failed'],
    stats: { filesCount: 4, filesFailed: 2, rowsCount: 6, sectionsCount: 8 },
    warnings: ['warning'],
  });
});
