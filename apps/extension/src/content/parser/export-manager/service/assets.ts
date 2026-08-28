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
import type { ContentPrivilegedActionIntentSource } from '../../../platform/privileged-action-intent/client';
import type { FullPageExportCaptureIdentity } from '../../../../contracts/full-page-capture';
import { captureWebSnapshotScreenshotWithWarnings } from '../../web-snapshot/capture';
import { translate } from '../../../../platform/i18n';

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
  contentIntentSource?: ContentPrivilegedActionIntentSource | undefined;
  fullPageCaptureIdentity?: FullPageExportCaptureIdentity | undefined;
}): Promise<ArchiveAsset[]> {
  args.throwIfCancelled();
  const extraAssets: ArchiveAsset[] = [];
  const updateDiagnosticProgress = (
    activeStepKey: 'basicLogs' | 'pageDiagnostics' | 'cssDiagnostics'
  ) => {
    updateExportManagerProgress(args.state, {
      activeStepKey,
      current: 0,
      errors: args.warnings,
      message: translate('content.runtime.scanPageStructure'),
      phase: 'scanning',
      total: 1,
    });
  };

  if (args.options.includeBasicLogs) updateDiagnosticProgress('basicLogs');
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
  if (args.options.includePageDiagnostics) updateDiagnosticProgress('pageDiagnostics');
  extraAssets.push(
    ...(await collectAdvancedLogAssets(args.options, args.snapshot.tree, args.diagnosticsSource))
  );
  args.throwIfCancelled();
  if (args.options.includeCssDiagnostics) updateDiagnosticProgress('cssDiagnostics');
  extraAssets.push(...collectCssDiagnosticAssets(args.options, args.diagnosticsSource));

  if (args.options.includeFullPageScreenshot) {
    updateExportManagerProgress(args.state, {
      activeStepKey: 'fullPageScreenshot',
      current: 0,
      errors: args.warnings,
      message: translate('content.runtime.captureFullPageScreenshot'),
      phase: 'scanning',
      total: 1,
    });
    try {
      const screenshot = await captureWebSnapshotScreenshotWithWarnings(
        args.contentIntentSource,
        args.fullPageCaptureIdentity
      );
      extraAssets.push({ content: screenshot.blob, path: 'page-screenshot.png' });
      args.warnings.push(...screenshot.warnings);
    } catch {
      args.warnings.push(translate('content.runtime.captureFullPageScreenshotFailed'));
    }
  }
  args.throwIfCancelled();
  return extraAssets;
}
