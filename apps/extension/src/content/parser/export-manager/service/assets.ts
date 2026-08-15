import type { ExportOptions } from '@sniptale/runtime-contracts/export';
import type { PreparedDOMTreeSnapshot } from '../../dom-tree-parser/snapshot';
import {
  collectAdvancedLogAssets,
  collectCssDiagnosticAssets,
  collectCoreLogAssets,
} from '../diagnostics';
import type { ArchiveAsset } from '../archive';
import type { ExportDiagnosticsSource } from '../diagnostics/source';
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
  downloadedFilesCount: number;
  options: ExportOptions;
  snapshot: PreparedDOMTreeSnapshot;
  state: ExportManagerState;
  warnings: string[];
  fileCandidatesCount: number;
  diagnosticsSource?: ExportDiagnosticsSource | undefined;
  throwIfCancelled: () => void;
}): Promise<ArchiveAsset[]> {
  args.throwIfCancelled();
  const extraAssets: ArchiveAsset[] = [];
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
    ...(await collectAdvancedLogAssets(args.options, args.snapshot.tree, args.diagnosticsSource))
  );
  args.throwIfCancelled();
  extraAssets.push(...collectCssDiagnosticAssets(args.options, args.diagnosticsSource));
  return extraAssets;
}
