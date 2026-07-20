// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import type { ExportOptions } from '@sniptale/runtime-contracts/export';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import {
  createArchiveArtifact,
  createCaptureArtifact,
  createCaptureArtifactFromTree,
  createExportArtifact,
} from './artifacts';
import { MAX_EXPORT_ARCHIVE_INPUT_BYTES } from './generation';

function createTree(): ParsedDOMTree {
  return {
    context: 'Support Portal',
    title: 'Preview export',
    structure: [],
  };
}

function createOptions(): ExportOptions {
  return {
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: true,
    includeFullPageScreenshot: false,
    includeHarDomLogs: false,
    includeImages: true,
    includeJson: true,
    includeMarkdown: false,
  };
}

function createSizedBlob(size: number): Blob {
  const blob = new Blob([]);

  Object.defineProperty(blob, 'size', {
    configurable: true,
    value: size,
  });

  return blob;
}

function createExportArtifactInput(
  overrides: Partial<Parameters<typeof createExportArtifact>[0]> = {}
) {
  return {
    binaryMode: 'blob' as const,
    capture: createCaptureArtifactFromTree(createTree()),
    data: null,
    errors: [],
    extraAssets: [],
    files: new Map<string, Blob>(),
    options: createOptions(),
    previewToDownloadMap: new Map<string, string>(),
    urlUuidToFilename: new Map<string, string>(),
    ...overrides,
  };
}

describe('export-manager capture artifact validation', () => {
  it('rejects malformed capture artifacts before export assembly', () => {
    expect(() =>
      createCaptureArtifact({
        iframeReadiness: {
          pendingIframes: [],
          timedOut: false,
          totalIframes: 0,
        },
        tree: { context: 'invalid', title: 'Invalid' } as ParsedDOMTree,
      })
    ).toThrow('Invalid export capture artifact');
  });
});

describe('export-manager export artifact filename validation', () => {
  it('normalizes raw file names before building the export artifact', () => {
    const artifact = createExportArtifact(
      createExportArtifactInput({
        files: new Map([['..%2Fsecret\u0000report.txt', new Blob(['secret'])]]),
      })
    );

    expect([...artifact.files.keys()]).toEqual(['secret_report.txt']);
  });

  it('preserves preview-to-download binding ids without treating them as filenames', () => {
    const artifact = createExportArtifact(
      createExportArtifactInput({
        previewToDownloadMap: new Map([['preview-uuid', 'download-uuid']]),
      })
    );

    expect([...artifact.previewToDownloadMap.entries()]).toEqual([
      ['preview-uuid', 'download-uuid'],
    ]);
  });

  it('rejects unsafe preview-to-download binding ids', () => {
    expect(() =>
      createExportArtifact(
        createExportArtifactInput({
          previewToDownloadMap: new Map([['preview', '../download']]),
        })
      )
    ).toThrow('Unsafe export artifact binding id');
  });
});

describe('export-manager export artifact package validation', () => {
  it('rejects unsafe archive asset paths before package assembly', () => {
    expect(() =>
      createExportArtifact(
        createExportArtifactInput({
          extraAssets: [{ path: '../logs/meta.json', content: '{}' }],
        })
      )
    ).toThrow('Unsafe export archive path');
  });

  it('rejects oversized export file blobs before package assembly', () => {
    expect(() =>
      createExportArtifact(
        createExportArtifactInput({
          files: new Map([['oversized.bin', createSizedBlob(MAX_EXPORT_ARCHIVE_INPUT_BYTES + 1)]]),
        })
      )
    ).toThrow('Export artifact blob is too large');
  });
});

describe('export-manager archive artifact validation', () => {
  it('rejects invalid archive package entries before zip generation', () => {
    expect(() =>
      createArchiveArtifact({
        archiveBaseName: 'invalid-entry',
        entries: [{ path: 'logs/../secret.log', textContent: 'secret' }],
        errors: [],
        stats: {
          filesCount: 0,
          filesFailed: 0,
          rowsCount: 0,
          sectionsCount: 0,
        },
      })
    ).toThrow('Unsafe export archive path');
  });
});
