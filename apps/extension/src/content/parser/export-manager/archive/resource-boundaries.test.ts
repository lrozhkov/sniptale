// @vitest-environment jsdom

import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import type { ExportOptions } from '@sniptale/runtime-contracts/export';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';

const { blobToDataUrlMock } = vi.hoisted(() => ({
  blobToDataUrlMock: vi.fn(),
}));

vi.mock('../../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/media-utils/data-url')>()),
  blobToDataUrl: blobToDataUrlMock,
}));

import {
  buildExportPagePackage,
  createExportArchive,
  createExportArchiveBlob,
  MAX_EXPORT_ARCHIVE_INPUT_BYTES,
} from '.';
import {
  createArchiveArtifact,
  createCaptureArtifactFromTree,
  createExportArtifact,
} from './artifacts';
import type { ExportArchivePackageEntry } from './types';

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

function createArchiveParams() {
  return {
    treeData: createArchiveTree(),
    data: null,
    files: new Map([['file.png', new Blob(['png'], { type: 'image/png' })]]),
    errors: [],
    options: createArchiveOptions(),
    previewToDownloadMap: new Map<string, string>(),
    urlUuidToFilename: new Map<string, string>(),
    extraAssets: [],
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

function createExportArtifactFromArchiveParams(params: ReturnType<typeof createArchiveParams>) {
  return createExportArtifact({
    binaryMode: 'base64',
    capture: createCaptureArtifactFromTree(params.treeData),
    data: params.data,
    errors: params.errors,
    extraAssets: params.extraAssets,
    files: params.files,
    options: params.options,
    previewToDownloadMap: params.previewToDownloadMap,
    urlUuidToFilename: params.urlUuidToFilename,
  });
}

function createArchiveArtifactForEntries(entries: ExportArchivePackageEntry[]) {
  return createArchiveArtifact({
    archiveBaseName: 'test-archive',
    entries,
    errors: [],
    stats: {
      filesCount: 0,
      filesFailed: 0,
      rowsCount: 0,
      sectionsCount: 0,
    },
  });
}

describe('export-manager archive binary resource boundaries', () => {
  it('keeps direct archive binaries as blobs instead of converting through data URLs', async () => {
    blobToDataUrlMock.mockRejectedValue(new Error('base64 conversion should not run'));

    const archive = await createExportArchive(createArchiveParams());
    const zip = await JSZip.loadAsync(archive.blob);

    await expect(zip.file('files/file.png')?.async('string')).resolves.toBe('png');
    expect(blobToDataUrlMock).not.toHaveBeenCalled();
  });

  it('keeps popup package binaries base64-backed for runtime-message transport', async () => {
    blobToDataUrlMock.mockResolvedValue('data:image/png;base64,cG5n');

    const pagePackage = await buildExportPagePackage(
      createExportArtifactFromArchiveParams(createArchiveParams())
    );

    expect(pagePackage.entries).toContainEqual(
      expect.objectContaining({
        binaryBase64: 'cG5n',
        path: 'files/file.png',
      })
    );
    expect(blobToDataUrlMock).toHaveBeenCalledOnce();
  });
});

describe('export-manager archive generation limits', () => {
  it('writes base64 package entries without decoding before the zip owner', async () => {
    const archive = await createExportArchiveBlob(
      createArchiveArtifactForEntries([{ binaryBase64: 'cG5n', path: 'files/file.png' }])
    );
    const zip = await JSZip.loadAsync(archive);

    await expect(zip.file('files/file.png')?.async('string')).resolves.toBe('png');
  });

  it('rejects oversized archive input before generating the zip', async () => {
    const oversizedBlob = createSizedBlob(MAX_EXPORT_ARCHIVE_INPUT_BYTES + 1);

    expect(() =>
      createArchiveArtifactForEntries([
        { binaryContent: oversizedBlob, path: 'files/oversized.bin' },
      ])
    ).toThrow('Export artifact blob is too large');
  });
});

describe('export-manager archive generation cancellation', () => {
  it('rejects cancellation before generating the zip', async () => {
    await expect(
      createExportArchiveBlob(
        createArchiveArtifactForEntries([{ path: 'file.txt', textContent: 'file' }]),
        {
          createCancelledError: () => new Error('cancelled'),
          isCancelled: () => true,
        }
      )
    ).rejects.toThrow('cancelled');
  });

  it('rejects cancellation after zip streaming starts', async () => {
    let cancelled = false;
    const archivePromise = createExportArchiveBlob(
      createArchiveArtifactForEntries([{ path: 'file.txt', textContent: 'file' }]),
      {
        createCancelledError: () => new Error('cancelled'),
        isCancelled: () => cancelled,
      }
    );

    await Promise.resolve();
    cancelled = true;

    await expect(archivePromise).rejects.toThrow('cancelled');
  });
});
