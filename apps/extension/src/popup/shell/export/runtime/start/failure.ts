import { getPopupExportErrorMessage } from '../preview-request';
import type { PopupExportRuntimeContract } from '../state';

export function reportStartExportFailure(state: PopupExportRuntimeContract, error: unknown) {
  state.requestIdRef.current = null;
  state.setProgress({
    activeStepKey: null,
    phase: 'error',
    message: getPopupExportErrorMessage(error, 'popup.export.startExportError'),
    current: 0,
    total: 0,
    errors: [],
  });
}
