import { translate } from '../../../../platform/i18n';
import { getDefaultPopupExportRuntimeDeps } from './default-deps';
import { logPopupExportCancelFailure } from './logging';
import type { PopupExportRuntimeDeps } from './types';
import type { PopupExportRuntimeContract } from './state';

export async function cancelPopupExport(
  state: PopupExportRuntimeContract,
  deps: PopupExportRuntimeDeps = getDefaultPopupExportRuntimeDeps()
): Promise<void> {
  if (state.exportDisabledReason) {
    return;
  }

  try {
    if (state.selectedTabIdsInOrder.length > 1) {
      state.requestIdRef.current = null;
      state.setProgress({
        activeStepKey: null,
        phase: 'error',
        message: translate('content.runtime.exportCancelled'),
        current: 0,
        total: 0,
        errors: [translate('content.runtime.exportCancelled')],
      });
      return;
    }

    const [selectedTabId] = state.selectedTabIdsInOrder;
    if (typeof selectedTabId === 'number') {
      await deps.sendCancelMessage(selectedTabId);
    }
  } catch (error) {
    logPopupExportCancelFailure(error);
  }
}
