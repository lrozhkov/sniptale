import type { ExportOptions, ExportProgress } from '@sniptale/runtime-contracts/export';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import {
  collectExportFiles,
  downloadExportFiles,
  type CollectFilesResult,
} from '../service/workflow';
import type { ExportDiagnosticsSource } from '../diagnostics/source';

type ExportManagerTransferControl = {
  abortSignal: AbortSignal | undefined;
  createCancelledError: () => Error;
  diagnosticsSource?: ExportDiagnosticsSource | undefined;
  isCancelled: () => boolean;
  setPreviewToDownloadMap: (value: Map<string, string>) => void;
  setUrlUuidToFilename: (value: Map<string, string>) => void;
  updateProgress: (progress: Partial<ExportProgress>) => void;
};

type ExportManagerTransferTools = {
  collectFiles: typeof collectExportFiles;
  downloadFiles: typeof downloadExportFiles;
};

const DEFAULT_TRANSFER_TOOLS: ExportManagerTransferTools = {
  collectFiles: collectExportFiles,
  downloadFiles: downloadExportFiles,
};

function throwIfExportCancelled(control: ExportManagerTransferControl): void {
  if (control.isCancelled()) {
    throw control.createCancelledError();
  }
}

async function collectExportManagerFiles(
  treeData: ParsedDOMTree,
  options: ExportOptions,
  control: ExportManagerTransferControl,
  tools: ExportManagerTransferTools
): Promise<CollectFilesResult> {
  const collectedFiles = await tools.collectFiles(
    treeData,
    options,
    (progress) => control.updateProgress(progress),
    () => control.isCancelled(),
    control.diagnosticsSource
  );
  throwIfExportCancelled(control);
  control.setPreviewToDownloadMap(collectedFiles.previewToDownloadMap);
  return collectedFiles;
}

async function downloadExportManagerFiles(
  files: Awaited<ReturnType<typeof collectExportFiles>>['files'],
  activeStepKey: 'files' | 'images',
  control: ExportManagerTransferControl,
  tools: ExportManagerTransferTools
) {
  const result =
    files.length > 0
      ? await tools.downloadFiles(
          files,
          control.abortSignal,
          () => control.isCancelled(),
          (progress) => control.updateProgress({ ...progress, activeStepKey }),
          control.diagnosticsSource
        )
      : {
          files: new Map<string, Blob>(),
          errors: [],
          urlUuidToFilename: new Map<string, string>(),
        };

  throwIfExportCancelled(control);
  control.setUrlUuidToFilename(result.urlUuidToFilename);
  return result;
}

/**
 * Collects and downloads export file candidates in one seam.
 */
export async function collectFilesForExportManager(
  treeData: ParsedDOMTree,
  options: ExportOptions,
  warnings: string[],
  control: ExportManagerTransferControl,
  tools: ExportManagerTransferTools = DEFAULT_TRANSFER_TOOLS
) {
  const collectedFiles = await collectExportManagerFiles(treeData, options, control, tools);
  const downloadResult = await downloadExportManagerFiles(
    collectedFiles.files,
    options.includeImages ? 'images' : 'files',
    control,
    tools
  );
  warnings.push(...downloadResult.errors);

  return { collectedFiles, downloadResult };
}
