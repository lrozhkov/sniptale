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
  | 'terminalRequestIdRef'
  | 'selectedTabIdsInOrder'
  | 'setProgress'
  | 'setResult'
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

function isOwnedCancellingStatus(
  response: Awaited<ReturnType<typeof cancelOwnedExport>>,
  exportRunId: string
) {
  return (
    response?.success === true &&
    response.status?.jobId === exportRunId &&
    response.status.phase === 'cancelling'
  );
}

export async function cancelPopupExport(
  state: PopupExportCancellationState,
  deps: PopupExportCancellationDeps = getDefaultPopupExportRuntimeDeps()
): Promise<void> {
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
    if (cancellation.cancellationPending === true) return;
    state.cancelRetryRef.current = { ...cancellation, cancellationPending: true };
    state.setProgress((current) => ({
      ...current,
      message: translate('popup.export.cancellingMessage'),
    }));
    const response = await cancelOwnedExport(cancellation, deps);
    if (!isOwnedCancellingStatus(response, cancellation.exportRunId)) {
      state.cancelRetryRef.current = { ...cancellation };
      reportCancellationFailure(state, response?.error || 'Popup export cancellation was rejected');
      return;
    }
    const status = response.status;
    if (!status) throw new Error('Popup export cancellation status is unavailable');
    state.setProgress({
      ...status.progress,
      activeStepKey: status.progress.activeStepKey ?? null,
      message: translate('popup.export.cancellingMessage'),
    });
  } catch (error) {
    const cancellation = state.cancelRetryRef.current;
    if (cancellation) {
      const { cancellationPending: _pending, ...retryable } = cancellation;
      state.cancelRetryRef.current = retryable;
    }
    reportCancellationFailure(state, error);
  }
}
