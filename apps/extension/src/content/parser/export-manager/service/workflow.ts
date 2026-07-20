import { translate } from '../../../../platform/i18n';
import type {
  ExportOptions,
  ExportProgress,
  FileResource,
} from '@sniptale/runtime-contracts/export';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import {
  collectDirectLinks,
  collectDynamicLinks,
  collectFroalaImageResources,
  downloadFileResources,
} from '../files';
import type { ExportDiagnosticsSource } from '../diagnostics/source';

type UpdateProgress = (progress: Partial<ExportProgress>) => void;

export interface CollectFilesResult {
  files: FileResource[];
  previewToDownloadMap: Map<string, string>;
}

function pushScanningProgress(
  updateProgress: UpdateProgress,
  activeStepKey: ExportProgress['activeStepKey'],
  message: string,
  current = 0,
  total = 0
) {
  updateProgress({
    phase: 'scanning',
    message,
    current,
    total,
    ...(activeStepKey === undefined ? {} : { activeStepKey }),
  });
}

async function collectImageExportFiles(args: {
  diagnosticsSource?: ExportDiagnosticsSource | undefined;
  updateProgress: UpdateProgress;
  isCancelled: () => boolean;
}): Promise<CollectFilesResult> {
  pushScanningProgress(
    args.updateProgress,
    'images',
    translate('content.runtime.scanDynamicContent')
  );

  const files = await collectDynamicLinks(
    (current, total, message) =>
      pushScanningProgress(args.updateProgress, 'images', message, current, total),
    args.isCancelled,
    args.diagnosticsSource
  );

  pushScanningProgress(
    args.updateProgress,
    'images',
    translate('content.runtime.scanFroalaImages')
  );

  const froalaResult = await collectFroalaImageResources(
    (current, total, message) =>
      pushScanningProgress(args.updateProgress, 'images', message, current, total),
    args.diagnosticsSource
  );

  return {
    files: [...files, ...froalaResult.resources],
    previewToDownloadMap: froalaResult.previewToDownloadMap,
  };
}

export async function collectExportFiles(
  treeData: ParsedDOMTree,
  options: ExportOptions,
  updateProgress: UpdateProgress,
  isCancelled: () => boolean,
  diagnosticsSource?: ExportDiagnosticsSource
): Promise<CollectFilesResult> {
  const files: FileResource[] = [];
  const previewToDownloadMap = new Map<string, string>();

  if (options.includeFiles) {
    pushScanningProgress(updateProgress, 'files', translate('content.runtime.scanDirectLinks'));
    files.push(...collectDirectLinks(treeData, diagnosticsSource));
  }

  if (!options.includeImages) {
    return { files, previewToDownloadMap };
  }

  const imageResult = await collectImageExportFiles({
    updateProgress,
    isCancelled,
    diagnosticsSource,
  });

  files.push(...imageResult.files);
  return {
    files,
    previewToDownloadMap: imageResult.previewToDownloadMap,
  };
}

export async function downloadExportFiles(
  files: FileResource[],
  abortSignal: AbortSignal | undefined,
  isCancelled: () => boolean,
  updateProgress: UpdateProgress,
  diagnosticsSource?: ExportDiagnosticsSource
): Promise<{ files: Map<string, Blob>; errors: string[]; urlUuidToFilename: Map<string, string> }> {
  updateProgress({
    activeStepKey: 'files',
    phase: 'downloading',
    message: `${translate('content.runtime.downloadFilesPrefix')} (0/${files.length})...`,
    current: 0,
    total: files.length,
  });

  return downloadFileResources(
    files,
    abortSignal,
    isCancelled,
    (current, total) => {
      updateProgress({
        activeStepKey: 'files',
        phase: 'downloading',
        message: `${translate('content.runtime.downloadFilesPrefix')} (${current}/${total})...`,
        current,
        total,
      });
    },
    diagnosticsSource?.pageUrl
  );
}
