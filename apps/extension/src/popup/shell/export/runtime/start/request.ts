import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { getPopupExportSelection } from '../../session/selectors';
import { buildPopupExportOptions } from '../options';
import { getPopupExportTransportErrorMessage } from '../preview-request';
import type { PopupExportRuntimeDeps } from '../types';
import type { PopupExportRuntimeContract } from '../state';
import { setStartExportProgress } from './progress';

export async function requestStartExport(
  state: PopupExportRuntimeContract,
  tabId: number,
  deps: PopupExportRuntimeDeps
): Promise<void> {
  const requestId = deps.createRequestId();

  state.requestIdRef.current = requestId;
  state.setResult(null);
  setStartExportProgress(state);

  const response = await deps.sendStartMessage(tabId, {
    type: MessageType.EXPORT_POPUP_START,
    requestId,
    options: buildPopupExportOptions(getPopupExportSelection(state)),
  });

  if (!response?.success) {
    throw new Error(
      getPopupExportTransportErrorMessage(response?.error, 'popup.export.startExportError')
    );
  }
}
