import { translate } from '../../../../../platform/i18n';
import type { PopupExportRuntimeContract } from '../state';
import type { PopupExportBatchPackage } from '../types';
import { createBatchExportResult, getBatchExportStats } from './batch-archive';

export function isCurrentBatchRequest(
  state: PopupExportRuntimeContract,
  requestId: string
): boolean {
  return state.requestIdRef.current === requestId;
}

export function setBatchExportProgress(
  state: PopupExportRuntimeContract,
  current: number,
  total: number,
  message: string,
  phase: 'scanning' | 'downloading' | 'zipping'
) {
  state.setProgress({
    activeStepKey: null,
    current,
    errors: [],
    message,
    phase,
    total,
  });
}

export function getSelectedBatchTabs(state: PopupExportRuntimeContract, selectedTabIds: number[]) {
  return state.availableTabs.filter(
    (tab) => typeof tab.tabId === 'number' && selectedTabIds.includes(tab.tabId)
  );
}

export function finishEmptyBatchExport(args: {
  errors: string[];
  requestId: string;
  selectedCount: number;
  state: PopupExportRuntimeContract;
  total: number;
  onEmptyResult: (details: {
    errorCount: number;
    requestId: string;
    selectedCount: number;
  }) => void;
}) {
  args.onEmptyResult({
    errorCount: args.errors.length,
    requestId: args.requestId,
    selectedCount: args.selectedCount,
  });
  args.state.requestIdRef.current = null;
  args.state.setResult({
    success: false,
    errors: args.errors,
    stats: {
      sectionsCount: 0,
      rowsCount: 0,
      filesCount: 0,
      filesFailed: 0,
    },
  });
  args.state.setProgress({
    activeStepKey: null,
    current: 0,
    errors: args.errors,
    message: args.errors[0] ?? translate('popup.export.startExportError'),
    phase: 'error',
    total: args.total,
  });
}

function getBatchFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : translate('popup.export.startExportError');
}

export function setBatchSaveFailureProgress(args: {
  error: unknown;
  errors: string[];
  pagePackages: PopupExportBatchPackage[];
  state: PopupExportRuntimeContract;
}) {
  const failureMessage = getBatchFailureMessage(args.error);
  const errors = [failureMessage, ...args.errors.filter((error) => error !== failureMessage)];

  args.state.requestIdRef.current = null;
  args.state.setResult({
    success: false,
    errors,
    stats: getBatchExportStats(args.pagePackages),
  });
  args.state.setProgress({
    activeStepKey: null,
    current: args.pagePackages.length,
    errors,
    message: failureMessage,
    phase: 'error',
    total: args.pagePackages.length,
  });
}

export function applyBatchExportResult(args: {
  errors: string[];
  filename: string;
  pagePackages: PopupExportBatchPackage[];
  state: PopupExportRuntimeContract;
}) {
  const result = createBatchExportResult({
    errors: args.errors,
    filename: args.filename,
    packages: args.pagePackages,
  });

  args.state.requestIdRef.current = null;
  args.state.setResult(result);
  args.state.setProgress({
    activeStepKey: null,
    current: args.pagePackages.length,
    errors: args.errors,
    message: result.success
      ? translate('popup.export.batchCompletedMessage')
      : (args.errors[0] ?? translate('popup.export.startExportError')),
    phase: result.success ? 'done' : 'error',
    total: args.pagePackages.length,
  });
}
