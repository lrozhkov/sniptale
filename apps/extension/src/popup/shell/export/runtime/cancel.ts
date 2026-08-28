import { translate } from '../../../../platform/i18n/popup';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
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
type PopupExportCancellationDeps = Pick<PopupExportRuntimeDeps, 'sendCancelJobMessage'>;

async function cancelOwnedExport(
  cancellation: NonNullable<PopupExportCancellationState['cancelRetryRef']['current']>,
  deps: PopupExportCancellationDeps
) {
  if (!deps.sendCancelJobMessage) {
    throw new Error('Popup export job cancellation transport is unavailable');
  }
  return deps.sendCancelJobMessage({
    type: MessageType.CANCEL_PAGE_PACKAGE_JOB,
    jobId: cancellation.exportRunId,
  });
}

function reportCancellationFailure(state: PopupExportCancellationState, error: unknown): void {
  logPopupExportCancelFailure(error);
  const message = translate('content.runtime.exportCancelFailed');
  state.setProgress({
    activeStepKey: null,
    phase: 'error',
    message,
    current: 0,
    total: 0,
    errors: [message],
  });
}

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
        ? {
            exportRunId: activeExportRunId,
            owner: 'job' as const,
            tabIds: [...state.selectedTabIdsInOrder],
          }
        : null);
    if (!cancellation) {
      return;
    }
    state.requestIdRef.current = null;
    state.cancelRetryRef.current = cancellation;
    const response = await cancelOwnedExport(cancellation, deps);
    if (response?.success !== true) {
      reportCancellationFailure(state, response?.error || 'Popup export cancellation was rejected');
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
    reportCancellationFailure(state, error);
  }
}
