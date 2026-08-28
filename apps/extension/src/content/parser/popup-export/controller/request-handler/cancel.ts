import type { PopupSendResponse } from '../../helpers/messaging';
import type { PopupExportRequestHandlerRuntime, PopupExportRunner } from '../types';

type PopupExportCancelRequestHandlerProps = Pick<PopupExportRequestHandlerRuntime, 'state'> & {
  exportRunner: Pick<PopupExportRunner, 'cancel'>;
  exportRunId: string;
  sendResponse: PopupSendResponse;
};

export function handlePopupExportCancelRuntime(
  props: PopupExportCancelRequestHandlerProps
): boolean {
  if (props.state.isExportRunning && props.state.activeExportRequestId === props.exportRunId) {
    props.state.activeAbortController?.abort(new Error('Web snapshot save was cancelled'));
    props.exportRunner.cancel();
  }

  props.sendResponse({ success: true });
  return true;
}
