import { describe, expect, it, vi } from 'vitest';
import type { ExportOptions } from '@sniptale/runtime-contracts/export';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { collectFilesWithHarForExportManager } from './transfer';

const treeData: ParsedDOMTree = {
  context: '',
  title: 'Demo',
  structure: [],
};

function createExportOptions(): ExportOptions {
  return {
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: true,
    includeFullPageScreenshot: false,
    includeHarDomLogs: true,
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

describe('export-manager transfer success path', () => {
  it('collects files, downloads them and stops HAR capture', async () => {
    const warnings: string[] = [];
    const control = createTransferControl();
    const harHandle = { capabilityToken: 'har-token', expiresAtEpochMs: 123, sessionId: 'har-1' };
    const tools = {
      collectFiles: vi.fn(async () => ({
        files: [
          {
            url: 'https://example.com/file.png',
            filename: 'file.png',
            source: 'direct' as const,
          },
        ],
        previewToDownloadMap: new Map([['preview-1', 'download-1']]),
      })),
      downloadFiles: vi.fn(async () => ({
        files: new Map([['file-1', new Blob(['demo'])]]),
        errors: ['download warning'],
        urlUuidToFilename: new Map([['file-1', 'demo.png']]),
      })),
      startHarCapture: vi.fn(async () => harHandle),
      stopHarCapture: vi.fn(async () => ({
        har: { entries: [] },
        rawDiagnosticsEnabled: false,
      })),
    };

    const result = await collectFilesWithHarForExportManager(
      treeData,
      createExportOptions(),
      warnings,
      control,
      tools
    );

    expect(result.collectedFiles?.files).toHaveLength(1);
    expect(result.downloadResult?.files.size).toBe(1);
    expect(result.sessionHar).toEqual({ har: { entries: [] }, rawDiagnosticsEnabled: false });
    expect(warnings).toEqual(['download warning']);
    expect(control.setPreviewToDownloadMap).toHaveBeenCalledWith(
      new Map([['preview-1', 'download-1']])
    );
    expect(control.setUrlUuidToFilename).toHaveBeenCalledWith(new Map([['file-1', 'demo.png']]));
    expect(tools.stopHarCapture).toHaveBeenCalledWith(harHandle, warnings);
  });
});

describe('export-manager transfer cancellation', () => {
  it('still stops HAR capture when cancellation happens after file collection', async () => {
    const warnings: string[] = [];
    const control = createTransferControl();
    const harHandle = { capabilityToken: 'har-token', expiresAtEpochMs: 123, sessionId: 'har-1' };
    let isCancelled = false;
    control.isCancelled.mockImplementation(() => isCancelled);
    const tools = {
      collectFiles: vi.fn(async () => {
        isCancelled = true;
        return {
          files: [
            {
              url: 'https://example.com/file.png',
              filename: 'file.png',
              source: 'direct' as const,
            },
          ],
          previewToDownloadMap: new Map<string, string>(),
        };
      }),
      downloadFiles: vi.fn(),
      startHarCapture: vi.fn(async () => harHandle),
      stopHarCapture: vi.fn(async () => ({ har: { closed: true }, rawDiagnosticsEnabled: false })),
    };

    await expect(
      collectFilesWithHarForExportManager(treeData, createExportOptions(), warnings, control, tools)
    ).rejects.toThrow('cancelled');

    expect(tools.downloadFiles).not.toHaveBeenCalled();
    expect(tools.stopHarCapture).toHaveBeenCalledWith(harHandle, warnings);
  });
});

describe('export-manager transfer empty downloads', () => {
  it('returns an empty download result when no files are collected', async () => {
    const warnings: string[] = [];
    const control = createTransferControl();
    const tools = {
      collectFiles: vi.fn(async () => ({
        files: [],
        previewToDownloadMap: new Map<string, string>(),
      })),
      downloadFiles: vi.fn(),
      startHarCapture: vi.fn(async () => null),
      stopHarCapture: vi.fn(),
    };

    const result = await collectFilesWithHarForExportManager(
      treeData,
      createExportOptions(),
      warnings,
      control,
      tools
    );

    expect(result.downloadResult).toEqual({
      files: new Map(),
      errors: [],
      urlUuidToFilename: new Map(),
    });
    expect(control.setUrlUuidToFilename).toHaveBeenCalledWith(new Map());
    expect(tools.downloadFiles).not.toHaveBeenCalled();
    expect(tools.stopHarCapture).not.toHaveBeenCalled();
  });
});
