import { getPopupExportErrorMessage } from '../preview-request';
import type { PopupExportRuntimeContract } from '../state';
import type { AppLocale } from '../../../../../platform/i18n/popup';

export class PopupExportPublicStartError extends Error {}

export function reportStartExportFailure(
  state: PopupExportRuntimeContract,
  error: unknown,
  locale?: AppLocale
) {
  state.requestIdRef.current = null;
  state.cancelRetryRef.current = null;
  state.setProgress({
    activeStepKey: null,
    phase: 'error',
    message:
      error instanceof PopupExportPublicStartError
        ? error.message
        : getPopupExportErrorMessage(error, 'popup.export.startExportError', locale),
    current: 0,
    total: 0,
    errors: [],
  });
}
