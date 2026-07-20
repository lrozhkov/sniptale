import type { ExportData, ExportOptions } from '@sniptale/runtime-contracts/export';
import type { ContentPrivilegedActionIntentSource } from '../../../platform/privileged-action-intent/client';
import {
  buildExportPagePackage,
  createExportArchiveBlob,
  type ArchiveAsset,
  type ArchiveArtifact,
  type ExportArchiveBinaryMode,
} from '../archive';
import {
  createCaptureArtifact,
  createExportArtifact,
  type CaptureArtifact,
} from '../archive/artifacts';
import { buildExportData, createExportStats } from '../formats/data';
import type { PreparedDOMTreeSnapshot } from '../../dom-tree-parser/snapshot';
import type { PageSnapshotSource } from '../../page-snapshot/source';
import { collectFilesWithHarForExportManager } from '../archive/transfer';
import type { ExportDiagnosticsSource } from '../diagnostics/source';
import { updateExportManagerProgress, type ExportManagerState } from './state';
import { collectExportExtraAssets, finishExportSuccess } from './assets';
import {
  createExportCancelledError,
  createExportDiagnosticsSource,
  prepareExportManagerTreeData,
} from './source';
import {
  runWithConsoleDiagnosticsSession,
  shouldCaptureConsoleDiagnostics,
} from './diagnostics-session';

function throwIfExportCancelled(state: ExportManagerState): void {
  if (state.isCancelled) {
    throw createExportCancelledError();
  }
}

function createTransferControl(state: ExportManagerState) {
  return {
    abortSignal: state.abortController?.signal,
    createCancelledError: createExportCancelledError,
    isCancelled: () => state.isCancelled,
    setPreviewToDownloadMap: (value: Map<string, string>) => {
      state.previewToDownloadMap = value;
    },
    setUrlUuidToFilename: (value: Map<string, string>) => {
      state.urlUuidToFilename = value;
    },
    updateProgress: (progress: Parameters<typeof updateExportManagerProgress>[1]) =>
      updateExportManagerProgress(state, progress),
  };
}

function createArchiveGenerationControl(state: ExportManagerState) {
  return {
    createCancelledError: createExportCancelledError,
    isCancelled: () => state.isCancelled,
  };
}

async function collectExportTransferData(
  state: ExportManagerState,
  treeData: PreparedDOMTreeSnapshot['tree'],
  options: ExportOptions,
  warnings: string[],
  diagnosticsSource?: ExportDiagnosticsSource
) {
  return collectFilesWithHarForExportManager(treeData, options, warnings, {
    ...createTransferControl(state),
    diagnosticsSource,
  });
}

export async function runExportManagerPipeline(
  state: ExportManagerState,
  options: ExportOptions,
  warnings: string[],
  pipelineOptions: Pick<PackagePipelineOptions, 'contentIntentSource' | 'snapshotSource'> = {}
) {
  const shouldCaptureConsole = shouldCaptureConsoleDiagnostics(options);

  return runWithConsoleDiagnosticsSession(shouldCaptureConsole, async () => {
    const packageResult = await runExportManagerPackagePipeline(state, options, warnings, {
      binaryMode: 'blob',
      consoleDiagnosticsManaged: shouldCaptureConsole,
      contentIntentSource: pipelineOptions.contentIntentSource,
      finishOnPackage: false,
      snapshotSource: pipelineOptions.snapshotSource,
    });
    throwIfExportCancelled(state);
    const archiveBlob = await createExportArchiveBlob(
      packageResult.pagePackage,
      createArchiveGenerationControl(state)
    );
    throwIfExportCancelled(state);
    finishExportSuccess(state, packageResult.fileCandidatesCount, warnings);
    return {
      blob: archiveBlob,
      filename: `${packageResult.pagePackage.archiveBaseName}.zip`,
      stats: packageResult.stats,
    };
  });
}

interface PackagePipelineOptions {
  binaryMode?: ExportArchiveBinaryMode;
  consoleDiagnosticsManaged?: boolean;
  contentIntentSource?: ContentPrivilegedActionIntentSource | undefined;
  finishOnPackage?: boolean;
  snapshotSource?: PageSnapshotSource | undefined;
}

async function buildPipelinePagePackage(args: {
  binaryMode: ExportArchiveBinaryMode;
  captureArtifact: CaptureArtifact;
  downloadedFilesCount: number;
  exportData: ExportData | null;
  extraAssets: ArchiveAsset[];
  files: Map<string, Blob>;
  options: ExportOptions;
  state: ExportManagerState;
  warnings: string[];
}) {
  const stats = createExportStats(args.exportData, args.downloadedFilesCount, args.warnings.length);
  const exportArtifact = createExportArtifact({
    binaryMode: args.binaryMode,
    capture: args.captureArtifact,
    data: args.exportData,
    errors: args.warnings,
    extraAssets: args.extraAssets,
    files: args.files,
    options: args.options,
    urlUuidToFilename: args.state.urlUuidToFilename,
    previewToDownloadMap: args.state.previewToDownloadMap,
  });
  const pagePackage = await buildExportPagePackage(exportArtifact);

  return { pagePackage, stats };
}

async function collectPackagePipelineInputs(
  state: ExportManagerState,
  options: ExportOptions,
  warnings: string[],
  pipelineOptions: Pick<PackagePipelineOptions, 'contentIntentSource' | 'snapshotSource'> = {}
) {
  const snapshot = await prepareExportManagerTreeData(state, pipelineOptions.snapshotSource);
  const captureArtifact = createCaptureArtifact(snapshot);
  const diagnosticsSource = createExportDiagnosticsSource(pipelineOptions.snapshotSource);
  throwIfExportCancelled(state);
  const treeData = captureArtifact.treeData;
  const exportData = options.includeJson ? buildExportData(treeData) : null;
  const { collectedFiles, downloadResult, sessionHar } = await collectExportTransferData(
    state,
    treeData,
    options,
    warnings,
    diagnosticsSource
  );
  const fileCandidatesCount = collectedFiles?.files.length ?? 0;
  const downloadedFilesCount = downloadResult?.files.size ?? 0;
  const extraAssets = await collectExportExtraAssets({
    contentIntentSource: pipelineOptions.contentIntentSource,
    downloadedFilesCount,
    options,
    snapshot,
    state,
    warnings,
    fileCandidatesCount,
    sessionHar,
    diagnosticsSource,
    throwIfCancelled: () => throwIfExportCancelled(state),
  });

  return {
    captureArtifact,
    downloadedFilesCount,
    exportData,
    extraAssets,
    fileCandidatesCount,
    files: downloadResult?.files ?? new Map<string, Blob>(),
    treeData,
  };
}

export async function runExportManagerPackagePipeline(
  state: ExportManagerState,
  options: ExportOptions,
  warnings: string[],
  pipelineOptions: PackagePipelineOptions = {}
): Promise<{
  fileCandidatesCount: number;
  pagePackage: ArchiveArtifact;
  stats: ReturnType<typeof createExportStats>;
}> {
  const shouldCaptureConsole =
    !pipelineOptions.consoleDiagnosticsManaged && shouldCaptureConsoleDiagnostics(options);

  return runWithConsoleDiagnosticsSession(shouldCaptureConsole, async () => {
    const collected = await collectPackagePipelineInputs(state, options, warnings, {
      contentIntentSource: pipelineOptions.contentIntentSource,
      snapshotSource: pipelineOptions.snapshotSource,
    });
    throwIfExportCancelled(state);
    const { pagePackage, stats } = await buildPipelinePagePackage({
      binaryMode: pipelineOptions.binaryMode ?? 'base64',
      captureArtifact: collected.captureArtifact,
      downloadedFilesCount: collected.downloadedFilesCount,
      exportData: collected.exportData,
      extraAssets: collected.extraAssets,
      files: collected.files,
      options,
      state,
      warnings,
    });
    throwIfExportCancelled(state);

    if (pipelineOptions.finishOnPackage ?? true) {
      finishExportSuccess(state, collected.fileCandidatesCount, warnings);
    }

    return {
      fileCandidatesCount: collected.fileCandidatesCount,
      pagePackage: Object.assign(pagePackage, {
        errors: [...warnings],
        stats,
      }),
      stats,
    };
  });
}
