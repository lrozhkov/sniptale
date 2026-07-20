import type { ExportOptions } from '@sniptale/runtime-contracts/export';
import type { ContentPrivilegedActionIntentSource } from '../../../platform/privileged-action-intent/client';
import type { PreparedDOMTreeSnapshot } from '../../dom-tree-parser/snapshot';
import {
  collectAdvancedLogAssets,
  collectCssDiagnosticAssets,
  collectCoreLogAssets,
  type ExportHarCaptureResult,
} from '../diagnostics';
import type { ArchiveAsset } from '../archive';
import type { ExportDiagnosticsSource } from '../diagnostics/source';
import { captureOptionalArchiveAssets } from './runtime';
import { getExportCompletedMessage } from './source';
import { updateExportManagerProgress, type ExportManagerState } from './state';

export function finishExportSuccess(
  state: ExportManagerState,
  filesCount: number,
  errors: string[]
): void {
  updateExportManagerProgress(state, {
    phase: 'done',
    message: getExportCompletedMessage(),
    current: filesCount,
    total: filesCount,
    errors,
  });
}

export async function collectExportExtraAssets(args: {
  contentIntentSource?: ContentPrivilegedActionIntentSource | undefined;
  downloadedFilesCount: number;
  options: ExportOptions;
  snapshot: PreparedDOMTreeSnapshot;
  state: ExportManagerState;
  warnings: string[];
  fileCandidatesCount: number;
  sessionHar: ExportHarCaptureResult | null;
  diagnosticsSource?: ExportDiagnosticsSource | undefined;
  throwIfCancelled: () => void;
}): Promise<ArchiveAsset[]> {
  args.throwIfCancelled();
  const extraAssets = await captureOptionalArchiveAssets({
    contentIntentSource: args.contentIntentSource,
    options: args.options,
    updateProgress: (progress) => updateExportManagerProgress(args.state, progress),
    warnings: args.warnings,
  });
  args.throwIfCancelled();

  extraAssets.push(
    ...collectCoreLogAssets({
      options: args.options,
      treeData: args.snapshot.tree,
      iframeReadiness: args.snapshot.iframeReadiness,
      fileCandidatesCount: args.fileCandidatesCount,
      downloadedFilesCount: args.downloadedFilesCount,
      warnings: args.warnings,
      diagnosticsSource: args.diagnosticsSource,
    })
  );
  extraAssets.push(
    ...(await collectAdvancedLogAssets(
      args.options,
      args.sessionHar,
      args.snapshot.tree,
      args.diagnosticsSource
    ))
  );
  args.throwIfCancelled();
  extraAssets.push(...collectCssDiagnosticAssets(args.options, args.diagnosticsSource));
  return extraAssets;
}
