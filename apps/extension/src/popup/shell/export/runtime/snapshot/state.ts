import { translate } from '../../../../../platform/i18n';
import type { PopupExportRuntimeContract } from '../types';

export function setWebSnapshotError(state: PopupExportRuntimeContract, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  state.setProgress({
    activeStepKey: 'fullPageScreenshot',
    current: 0,
    errors: [message],
    message,
    phase: 'error',
    total: 1,
  });
  state.setResult({
    errors: [message],
    stats: {
      filesCount: 0,
      filesFailed: 1,
      rowsCount: 0,
      sectionsCount: 0,
    },
    success: false,
  });
}

export function getWebSnapshotUnavailableError(): Error {
  return new Error(translate('popup.export.startExportError'));
}
