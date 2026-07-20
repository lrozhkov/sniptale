import type { ExportOptions, ExportProgress } from '@sniptale/runtime-contracts/export';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { startHarCaptureIfNeeded, stopHarCaptureIfNeeded } from '../service/runtime';
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
  startHarCapture: typeof startHarCaptureIfNeeded;
  stopHarCapture: typeof stopHarCaptureIfNeeded;
};
type SessionHarCaptureResult = Awaited<ReturnType<ExportManagerTransferTools['stopHarCapture']>>;

const DEFAULT_TRANSFER_TOOLS: ExportManagerTransferTools = {
  collectFiles: collectExportFiles,
  downloadFiles: downloadExportFiles,
  startHarCapture: startHarCaptureIfNeeded,
  stopHarCapture: stopHarCaptureIfNeeded,
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
  control: ExportManagerTransferControl,
  tools: ExportManagerTransferTools
) {
  const result =
    files.length > 0
      ? await tools.downloadFiles(
          files,
          control.abortSignal,
          () => control.isCancelled(),
          (progress) => control.updateProgress(progress),
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
 * Collects export file candidates, downloads them, and keeps HAR capture ownership in one seam.
 */
export async function collectFilesWithHarForExportManager(
  treeData: ParsedDOMTree,
  options: ExportOptions,
  warnings: string[],
  control: ExportManagerTransferControl,
  tools: ExportManagerTransferTools = DEFAULT_TRANSFER_TOOLS
) {
  const harSessionId = options.includeHarDomLogs ? crypto.randomUUID() : null;
  const harHandle = await tools.startHarCapture(harSessionId, warnings);
  let collectedFiles: Awaited<ReturnType<typeof collectExportFiles>> | null = null;
  let downloadResult: Awaited<ReturnType<typeof downloadExportFiles>> | null = null;
  let sessionHar: SessionHarCaptureResult = null;

  try {
    collectedFiles = await collectExportManagerFiles(treeData, options, control, tools);
    downloadResult = await downloadExportManagerFiles(collectedFiles.files, control, tools);
    warnings.push(...downloadResult.errors);
  } finally {
    if (harHandle) {
      sessionHar = await tools.stopHarCapture(harHandle, warnings);
    }
  }

  return { collectedFiles, downloadResult, sessionHar };
}
