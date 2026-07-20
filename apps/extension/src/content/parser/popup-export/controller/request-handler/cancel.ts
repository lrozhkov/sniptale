import type { PopupSendResponse } from '../../helpers';
import { resetPopupExportState } from '../state';
import type { PopupExportRunner } from './types/runtime';
import type { PopupExportRequestHandlerRuntime } from './types/runtime';

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
