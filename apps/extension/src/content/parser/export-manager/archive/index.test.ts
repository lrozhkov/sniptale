// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { createExportArchive } from '.';

const treeData = {
  context: 'generic',
  structure: [],
  title: 'Example page',
};

async function openArchiveWithDiagnostics() {
  const archive = await createExportArchive({
    treeData,
    data: null,
    files: new Map([['attachment.txt', new Blob(['file'])]]),
    errors: ['warning one'],
    options: {
      includeBasicLogs: true,
      includeCssDiagnostics: false,
      includeFiles: true,
      includeFullPageScreenshot: true,
      includeHarDomLogs: true,
      includeImages: true,
      includeJson: false,
      includeMarkdown: false,
    },
    urlUuidToFilename: new Map(),
    previewToDownloadMap: new Map(),
    extraAssets: [
      { path: 'logs/meta.json', content: '{"ok":true}' },
      { path: 'logs/session.har', content: '{"log":{"entries":[]}}' },
      { path: 'page-screenshot.png', content: new Blob(['png']) },
    ],
  });

  return JSZip.loadAsync(archive.blob);
}

describe('archive layout for diagnostics artifacts', () => {
  it('places diagnostics under logs and screenshot at archive root', async () => {
    const zip = await openArchiveWithDiagnostics();

    expect(zip.file('logs/meta.json')).toBeTruthy();
    expect(zip.file('logs/session.har')).toBeTruthy();
    expect(zip.file('logs/errors.log')).toBeTruthy();
    expect(zip.file('page-screenshot.png')).toBeTruthy();
    expect(zip.file('files/attachment.txt')).toBeTruthy();
  });
});

describe('archive layout without warnings', () => {
  it('does not create logs/errors.log when there are no warnings', async () => {
    const archive = await createExportArchive({
      treeData,
      data: null,
      files: new Map(),
      errors: [],
      options: {
        includeBasicLogs: false,
        includeCssDiagnostics: false,
        includeFiles: false,
        includeFullPageScreenshot: false,
        includeHarDomLogs: false,
        includeImages: false,
        includeJson: false,
        includeMarkdown: false,
      },
      urlUuidToFilename: new Map(),
      previewToDownloadMap: new Map(),
    });

    const zip = await JSZip.loadAsync(archive.blob);
    expect(zip.file('logs/errors.log')).toBeNull();
  });
});
