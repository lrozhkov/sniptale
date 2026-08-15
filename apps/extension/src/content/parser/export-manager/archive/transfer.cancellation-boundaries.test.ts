import { expect, it, vi } from 'vitest';
import type { ExportOptions } from '@sniptale/runtime-contracts/export';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { collectFilesForExportManager } from './transfer';

const treeData: ParsedDOMTree = { context: '', title: 'Demo', structure: [] };

function createExportOptions(): ExportOptions {
  return {
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: true,
    includeFullPageScreenshot: false,
    includePageDiagnostics: true,
    includeImages: false,
    includeJson: true,
    includeMarkdown: true,
  };
}

function createTransferControl() {
  return {
    abortSignal: undefined,
    createCancelledError: () => new Error('cancelled'),
    isCancelled: vi.fn(() => false),
    setPreviewToDownloadMap: vi.fn(),
    setUrlUuidToFilename: vi.fn(),
    updateProgress: vi.fn(),
  };
}

it('does not commit partial download maps when cancellation lands after downloads', async () => {
  const warnings: string[] = [];
  const control = createTransferControl();
  let isCancelled = false;
  control.isCancelled.mockImplementation(() => isCancelled);
  const tools = {
    collectFiles: vi.fn(async () => ({
      files: [
        { filename: 'file.png', source: 'direct' as const, url: 'https://example.com/file.png' },
      ],
      previewToDownloadMap: new Map([['preview-1', 'download-1']]),
    })),
    downloadFiles: vi.fn(async () => {
      isCancelled = true;
      return {
        errors: ['partial warning'],
        files: new Map([['partial.png', new Blob(['partial'])]]),
        urlUuidToFilename: new Map([['uuid-1', 'partial.png']]),
      };
    }),
  };

  await expect(
    collectFilesForExportManager(treeData, createExportOptions(), warnings, control, tools)
  ).rejects.toThrow('cancelled');

  expect(control.setPreviewToDownloadMap).toHaveBeenCalledOnce();
  expect(control.setUrlUuidToFilename).not.toHaveBeenCalled();
  expect(warnings).toEqual([]);
});
