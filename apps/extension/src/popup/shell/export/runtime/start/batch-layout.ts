import type { PopupExportSelection } from '../state';

export type PopupBatchArchiveLayout = 'grouped' | 'flat';

function hasOnlyFlatEligibleOptions(selection: PopupExportSelection): boolean {
  const hasFlatEligibleSelection =
    selection.includeJson || selection.includeMarkdown || selection.includeFullPageScreenshot;
  const hasNonEligibleSelection =
    selection.includeFiles ||
    selection.includeImages ||
    selection.includeBasicLogs ||
    selection.includeHarDomLogs ||
    selection.includeCssDiagnostics;

  return hasFlatEligibleSelection && !hasNonEligibleSelection;
}

export function resolvePopupBatchArchiveLayout(args: {
  pageCount: number;
  selection: PopupExportSelection;
}): PopupBatchArchiveLayout {
  if (args.pageCount <= 1) {
    return 'grouped';
  }

  return hasOnlyFlatEligibleOptions(args.selection) ? 'flat' : 'grouped';
}
