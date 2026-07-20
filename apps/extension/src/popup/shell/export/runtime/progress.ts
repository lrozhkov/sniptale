import type { ExportProgress, PopupExportResult } from '@sniptale/runtime-contracts/export';
import type { PopupExportRuntimeContract } from './state';

function getResultProgressPhase(result: PopupExportResult): ExportProgress['phase'] {
  if (result.success || result.filename) {
    return 'done';
  }

  return 'error';
}

export function updatePopupExportProgressFromResult(
  setProgress: PopupExportRuntimeContract['setProgress'],
  result: PopupExportResult
) {
  setProgress((previous: ExportProgress) => ({
    ...previous,
    phase: getResultProgressPhase(result),
    errors: result.errors ?? previous.errors,
  }));
}
