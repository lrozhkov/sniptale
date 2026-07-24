import type { PopupSendResponse } from '../../helpers/messaging';
import { resetPopupExportState } from '../state';
import type { PopupExportRequestHandlerRuntime, PopupExportRunner } from '../types';

type PopupExportCancelRequestHandlerProps = Pick<PopupExportRequestHandlerRuntime, 'state'> & {
  exportRunner: Pick<PopupExportRunner, 'cancel'>;
  sendResponse: PopupSendResponse;
};

export function handlePopupExportCancelRuntime(
  props: PopupExportCancelRequestHandlerProps
): boolean {
  if (props.state.isExportRunning) {
    props.exportRunner.cancel();
    resetPopupExportState(props.state);
  }

  props.sendResponse({ success: true });
  return true;
}
