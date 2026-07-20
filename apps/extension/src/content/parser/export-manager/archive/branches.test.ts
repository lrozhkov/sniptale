// @vitest-environment jsdom

import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { ExportData, ExportOptions } from '@sniptale/runtime-contracts/export';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { createExportArchive } from '.';

function createArchiveOptions(overrides: Partial<ExportOptions> = {}): ExportOptions {
  return {
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: true,
    includeFullPageScreenshot: false,
    includeHarDomLogs: false,
    includeImages: true,
    includeJson: true,
    includeMarkdown: true,
    ...overrides,
  };
}

function createArchiveTree(title = 'Preview export'): ParsedDOMTree {
  return {
    context: 'Support Portal',
    title,
    structure: [
      {
        type: 'section',
        id: 'section-1',
        title: 'Overview',
        children: [
          {
            type: 'field',
            id: 'field-1',
            label: 'Preview',
            value: '[file_preview123]',
            valueType: 'string',
          },
        ],
      },
    ],
  };
}

function createExportData(title = 'Mapped export'): ExportData {
  return {
    meta: {
      date: '2026-03-31',
      title,
      url: 'https://example.test/export',
      userAgent: 'Vitest',
    },
    sections: [
      {
        title: 'Overview',
        fields: [
          {
            label: 'Preview',
            type: 'string',
            value: 'See [file_preview123]',
          },
        ],
      },
    ],
  };
}

async function openArchive(overrides: Partial<Parameters<typeof createExportArchive>[0]> = {}) {
  const archive = await createExportArchive({
    treeData: createArchiveTree(),
    data: createExportData(),
    files: new Map([['file_download123.png', new Blob(['png'])]]),
    errors: [],
    options: createArchiveOptions(),
    urlUuidToFilename: new Map([['file_download123', 'file_download123.png']]),
    previewToDownloadMap: new Map([['preview123', 'download123']]),
    extraAssets: [],
    ...overrides,
  });

  return {
    archive,
    zip: await JSZip.loadAsync(archive.blob),
  };
}

describe('export-manager archive branches', () => {
  it('writes json and markdown with preview-to-download filename mapping', async () => {
    const { archive, zip } = await openArchive();
    const archiveStem = archive.filename.replace(/\.zip$/u, '');

    const json = await zip.file(`${archiveStem}.json`)?.async('string');
    const markdown = await zip.file(`${archiveStem}.md`)?.async('string');

    expect(archive.filename).toMatch(/^Mapped_export_/);
    expect(json).toContain('See [file_download123.png]');
    expect(markdown).toContain('![file_download123.png](files/file_download123.png)');
    expect(zip.file('files/file_download123.png')).toBeTruthy();
  });

  it('falls back to the default export filename when both export-data and tree titles are empty', async () => {
    const { archive } = await openArchive({
      treeData: createArchiveTree(''),
      data: null,
      files: new Map(),
      options: createArchiveOptions({
        includeFiles: false,
        includeJson: false,
        includeMarkdown: false,
      }),
      previewToDownloadMap: new Map(),
      urlUuidToFilename: new Map(),
    });

    expect(archive.filename).toMatch(/^export_/);
  });

  it('writes image-only archives without requiring direct file export', async () => {
    const { archive, zip } = await openArchive({
      data: null,
      options: createArchiveOptions({
        includeFiles: false,
        includeImages: true,
        includeJson: false,
        includeMarkdown: false,
      }),
      previewToDownloadMap: new Map(),
      urlUuidToFilename: new Map(),
    });

    expect(archive.filename).toMatch(/^Preview_export_/);
    expect(zip.file('files/file_download123.png')).toBeTruthy();
    expect(Object.keys(zip.files).some((name) => name.endsWith('.json'))).toBe(false);
  });
});
