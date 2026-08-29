import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { buildPopupExportProgressSteps } from '../progress/steps';
import type {
  PopupExportDerivedState,
  PopupExportSelection,
  PopupExportSessionState,
  PopupExportToggleState,
} from './types';
import type { PopupPagePackageSelection } from '../../../../composition/persistence/popup-export-preferences';
import type { PopupExportTabSelectionState } from '../selection/tabs/types';

export function getPopupExportSelection(
  toggles: { values: PopupExportSelection } | PopupExportSelection
): PopupExportSelection {
  const values = 'values' in toggles ? toggles.values : toggles;

  return {
    includeAnnotations: values.includeAnnotations,
    includeBasicLogs: values.includeBasicLogs,
    includeCssDiagnostics: values.includeCssDiagnostics,
    includeFiles: values.includeFiles,
    includeFullPageScreenshot: values.includeFullPageScreenshot,
    includeViewportScreenshot: values.includeViewportScreenshot === true,
    includePageDiagnostics: values.includePageDiagnostics,
    includeImages: values.includeImages,
    includeJson: values.includeJson,
    includeMarkdown: values.includeMarkdown,
  };
}

export function getPopupPagePackageSelection(
  preferenceState: Pick<PopupExportToggleState, 'includeWebCopy' | 'values'>
): PopupPagePackageSelection {
  return {
    ...getPopupExportSelection(preferenceState),
    includeWebCopy: preferenceState.includeWebCopy,
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
  const isExporting =
    args.session.refs.cancelRetryRef.current?.cancellationPending === true ||
    getIsExporting(args.session.transfer.progress, args.session.transfer.result);
  const selection = getPopupExportSelection(args.toggles);
  const canExport =
    args.toggles.hasLoadedPreferences &&
    getCanExport({
      exportDisabledReason,
      ...selection,
      includeWebCopy: args.toggles.includeWebCopy,
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
      selection: args.session.transfer.launchedPlan ?? {
        ...selection,
        includeWebCopy: args.toggles.includeWebCopy,
      },
    }),
  };
}

export function getCanExport({
  exportDisabledReason,
  includeBasicLogs,
  includeAnnotations,
  includeCssDiagnostics,
  includeFiles,
  includeFullPageScreenshot,
  includeViewportScreenshot,
  includePageDiagnostics,
  includeImages,
  includeJson,
  includeMarkdown,
  includeWebCopy,
  isExporting,
  selectedCount,
}: {
  includeAnnotations: boolean;
  exportDisabledReason: string | null;
  includeBasicLogs: boolean;
  includeCssDiagnostics: boolean;
  includeFiles: boolean;
  includeFullPageScreenshot: boolean;
  includeViewportScreenshot?: boolean;
  includePageDiagnostics: boolean;
  includeImages: boolean;
  includeJson: boolean;
  includeMarkdown: boolean;
  includeWebCopy?: boolean;
  isExporting: boolean;
  selectedCount: number;
}): boolean {
  const hasSelectedArtifacts =
    includeAnnotations ||
    includeJson ||
    includeMarkdown ||
    includeFiles ||
    includeImages ||
    includeBasicLogs ||
    includeCssDiagnostics ||
    includePageDiagnostics ||
    includeFullPageScreenshot ||
    includeViewportScreenshot ||
    includeWebCopy === true;

  return !exportDisabledReason && hasSelectedArtifacts && !isExporting && selectedCount > 0;
}

function getExportDisabledReason(
  activeTabExportDisabledReason: string | null,
  tabSelection: PopupExportTabSelectionState
): string | null {
  if (tabSelection.activeSourceMode === 'urls' && tabSelection.selectedUrls.length > 0) {
    return null;
  }
  if (hasSelectedExportableTabs(tabSelection)) {
    return null;
  }

  return activeTabExportDisabledReason;
}

function hasSelectedExportableTabs(tabSelection: PopupExportTabSelectionState): boolean {
  if (tabSelection.activeSourceMode === 'urls') return tabSelection.selectedUrls.length > 0;
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
    progress.phase !== 'cancelled' &&
    progress.phase !== 'error' &&
    result === null
  );
}
