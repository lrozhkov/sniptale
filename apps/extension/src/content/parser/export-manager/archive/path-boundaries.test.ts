// @vitest-environment jsdom

import JSZip from 'jszip';
import { expect, it } from 'vitest';

import type { ExportOptions } from '@sniptale/runtime-contracts/export';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { createExportArchive } from '.';

function createArchiveOptions(): ExportOptions {
  return {
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: true,
    includeFullPageScreenshot: false,
    includeHarDomLogs: false,
    includeImages: true,
    includeJson: false,
    includeMarkdown: false,
  };
}

function createArchiveTree(): ParsedDOMTree {
  return {
    context: 'Support Portal',
    title: 'Preview export',
    structure: [],
  };
}

it('normalizes unsafe file names before creating archive paths', async () => {
  const archive = await createExportArchive({
    treeData: createArchiveTree(),
    data: null,
    files: new Map([['..%2Fsecret\u0000report.txt', new Blob(['secret'])]]),
    errors: [],
    options: createArchiveOptions(),
    previewToDownloadMap: new Map(),
    urlUuidToFilename: new Map(),
    extraAssets: [],
  });
  const zip = await JSZip.loadAsync(archive.blob);

  expect(zip.file('files/secret_report.txt')).toBeTruthy();
  expect(zip.file('files/../secret_report.txt')).toBeNull();
});
