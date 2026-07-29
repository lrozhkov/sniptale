import { translate } from '../../../../platform/i18n';
import { getDefaultPopupExportRuntimeDeps } from './default-deps';
import { logPopupExportCancelFailure } from './logging';
import type { PopupExportRuntimeDeps } from './types';
import type { PopupExportRuntimeContract } from './state';

type PopupExportCancellationState = Pick<
  PopupExportRuntimeContract,
  | 'cancelRetryRef'
  | 'exportDisabledReason'
  | 'requestIdRef'
  | 'selectedTabIdsInOrder'
  | 'setProgress'
>;
type PopupExportCancellationDeps = Pick<PopupExportRuntimeDeps, 'sendCancelMessage'>;

export async function cancelPopupExport(
  state: PopupExportCancellationState,
  deps: PopupExportCancellationDeps = getDefaultPopupExportRuntimeDeps()
): Promise<void> {
  if (state.exportDisabledReason) {
    return;
  }

  try {
    const activeExportRunId = state.requestIdRef.current;
    const cancellation =
      state.cancelRetryRef.current ??
      (activeExportRunId
        ? { exportRunId: activeExportRunId, tabIds: [...state.selectedTabIdsInOrder] }
        : null);
    if (!cancellation) {
      return;
    }
    state.requestIdRef.current = null;
    state.cancelRetryRef.current = cancellation;
    const results = await Promise.allSettled(
      cancellation.tabIds.map((tabId) => deps.sendCancelMessage(tabId, cancellation.exportRunId))
    );
    const failures: unknown[] = [];
    for (const result of results) {
      if (result.status === 'rejected') {
        failures.push(result.reason);
      } else if (result.value?.success !== true) {
        failures.push(new Error(result.value?.error || 'Popup export cancellation was rejected'));
      }
    }
    if (failures.length > 0) {
      for (const failure of failures) logPopupExportCancelFailure(failure);
      const message = translate('content.runtime.exportCancelFailed');
      state.setProgress({
        activeStepKey: null,
        phase: 'error',
        message,
        current: 0,
        total: 0,
        errors: [message],
      });
      return;
    }
    state.cancelRetryRef.current = null;
    state.setProgress({
      activeStepKey: null,
      phase: 'error',
      message: translate('content.runtime.exportCancelled'),
      current: 0,
      total: 0,
      errors: [translate('content.runtime.exportCancelled')],
    });
  } catch (error) {
    logPopupExportCancelFailure(error);
  }
}
