import { describe, expect, it, vi } from 'vitest';
import type { ExportOptions } from '@sniptale/runtime-contracts/export';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { collectFilesForExportManager } from './transfer';
import { downloadExportFiles } from '../service/workflow';

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

describe('export-manager transfer', () => {
  it('collects and downloads files while preserving warnings and maps', async () => {
    const warnings: string[] = [];
    const control = createTransferControl();
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
    };

    const result = await collectFilesForExportManager(
      treeData,
      createExportOptions(),
      warnings,
      control,
      tools
    );

    expect(result.collectedFiles.files).toHaveLength(1);
    expect(result.downloadResult.files.size).toBe(1);
    expect(warnings).toEqual(['download warning']);
    expect(control.setPreviewToDownloadMap).toHaveBeenCalledWith(
      new Map([['preview-1', 'download-1']])
    );
    expect(control.setUrlUuidToFilename).toHaveBeenCalledWith(new Map([['file-1', 'demo.png']]));
  });

  it('stops before downloads when cancellation follows collection', async () => {
    const warnings: string[] = [];
    const control = createTransferControl();
    control.isCancelled.mockReturnValue(true);
    const tools = {
      collectFiles: vi.fn(async () => ({
        files: [],
        previewToDownloadMap: new Map<string, string>(),
      })),
      downloadFiles: vi.fn(),
    };

    await expect(
      collectFilesForExportManager(treeData, createExportOptions(), warnings, control, tools)
    ).rejects.toThrow('cancelled');
    expect(tools.downloadFiles).not.toHaveBeenCalled();
  });

  it('returns an empty download result when no files are collected', async () => {
    const warnings: string[] = [];
    const control = createTransferControl();
    const tools = {
      collectFiles: vi.fn(async () => ({
        files: [],
        previewToDownloadMap: new Map<string, string>(),
      })),
      downloadFiles: vi.fn(),
    };

    const result = await collectFilesForExportManager(
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
    expect(tools.downloadFiles).not.toHaveBeenCalled();
  });

  it('keeps mixed resource transfer on the final images row instead of jumping back to files', async () => {
    const warnings: string[] = [];
    const control = createTransferControl();
    const options = { ...createExportOptions(), includeImages: true };
    const tools = {
      collectFiles: vi.fn(async () => ({
        files: [
          {
            url: 'https://example.com/file.png',
            filename: 'file.png',
            source: 'direct' as const,
          },
        ],
        previewToDownloadMap: new Map<string, string>(),
      })),
      downloadFiles: vi.fn(async (...args: Parameters<typeof downloadExportFiles>) => {
        const updateProgress = args[3];
        updateProgress({ activeStepKey: 'files', current: 1, total: 1 });
        return {
          files: new Map<string, Blob>(),
          errors: [],
          urlUuidToFilename: new Map<string, string>(),
        };
      }),
    };

    await collectFilesForExportManager(treeData, options, warnings, control, tools);

    expect(control.updateProgress).toHaveBeenCalledWith(
      expect.objectContaining({ activeStepKey: 'images' })
    );
    expect(control.updateProgress).not.toHaveBeenCalledWith(
      expect.objectContaining({ activeStepKey: 'files' })
    );
  });
});
