import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { buildPopupExportProgressSteps } from '../progress/steps';
import type {
  PopupExportDerivedState,
  PopupExportSelection,
  PopupExportSessionState,
  PopupExportToggleState,
} from './types';
import type { PopupExportTabSelectionState } from '../selection/tabs/types';

export function getPopupExportSelection(
  toggles: PopupExportToggleState | PopupExportSelection
): PopupExportSelection {
  const values = 'values' in toggles ? toggles.values : toggles;

  return {
    includeBasicLogs: values.includeBasicLogs,
    includeCssDiagnostics: values.includeCssDiagnostics,
    includeFiles: values.includeFiles,
    includeFullPageScreenshot: values.includeFullPageScreenshot,
    includeHarDomLogs: values.includeHarDomLogs,
    includeImages: values.includeImages,
    includeJson: values.includeJson,
    includeMarkdown: values.includeMarkdown,
  };
}

export function getPopupExportDerivedState(args: {
  activeTabCapabilities: ActiveTabCapabilities;
  pageAccessDisabledReason?: string | null;
  session: PopupExportSessionState;
  tabSelection: PopupExportTabSelectionState;
  toggles: PopupExportToggleState;
}): PopupExportDerivedState {
  const activeTabExportDisabledReason =
    args.activeTabCapabilities.export.reason ?? args.pageAccessDisabledReason ?? null;
  const exportDisabledReason = getExportDisabledReason(
    activeTabExportDisabledReason,
    args.tabSelection
  );
  const isExporting = getIsExporting(args.session.transfer.progress, args.session.transfer.result);
  const selection = getPopupExportSelection(args.toggles);
  const canExport = getCanExport({
    exportDisabledReason,
    ...selection,
    isExporting,
    selectedCount: args.tabSelection.selectedCount,
  });

  return {
    canCopyJson: !activeTabExportDisabledReason && !args.session.copy.copyingFormat,
    canCopyMarkdown: !activeTabExportDisabledReason && !args.session.copy.copyingFormat,
    canExport,
    exportDisabledReason,
    isExporting,
    progressSteps: buildPopupExportProgressSteps({
      progress: args.session.transfer.progress,
      result: args.session.transfer.result,
      selection,
    }),
  };
}

export function getCanExport({
  exportDisabledReason,
  includeBasicLogs,
  includeCssDiagnostics,
  includeFiles,
  includeFullPageScreenshot,
  includeHarDomLogs,
  includeImages,
  includeJson,
  includeMarkdown,
  isExporting,
  selectedCount,
}: {
  exportDisabledReason: string | null;
  includeBasicLogs: boolean;
  includeCssDiagnostics: boolean;
  includeFiles: boolean;
  includeFullPageScreenshot: boolean;
  includeHarDomLogs: boolean;
  includeImages: boolean;
  includeJson: boolean;
  includeMarkdown: boolean;
  isExporting: boolean;
  selectedCount: number;
}): boolean {
  const hasSelectedArtifacts =
    includeJson ||
    includeMarkdown ||
    includeFiles ||
    includeImages ||
    includeBasicLogs ||
    includeCssDiagnostics ||
    includeHarDomLogs ||
    includeFullPageScreenshot;

  return !exportDisabledReason && hasSelectedArtifacts && !isExporting && selectedCount > 0;
}

function getExportDisabledReason(
  activeTabExportDisabledReason: string | null,
  tabSelection: PopupExportTabSelectionState
): string | null {
  if (hasSelectedExportableTabs(tabSelection)) {
    return null;
  }

  return activeTabExportDisabledReason;
}

function hasSelectedExportableTabs(tabSelection: PopupExportTabSelectionState): boolean {
  if (tabSelection.selectedTabIds.length === 0) {
    return false;
  }

  const selectedTabIds = new Set(tabSelection.selectedTabIds);

  return tabSelection.availableTabs.some(
    (tab) =>
      tab.disabledReason === null && typeof tab.tabId === 'number' && selectedTabIds.has(tab.tabId)
  );
}

function getIsExporting(
  progress: PopupExportSessionState['transfer']['progress'],
  result: PopupExportSessionState['transfer']['result']
): boolean {
  return (
    progress.phase !== 'idle' &&
    progress.phase !== 'done' &&
    progress.phase !== 'error' &&
    result === null
  );
}
