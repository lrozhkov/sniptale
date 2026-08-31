import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { respondWithPopupPreview } from '../preview';
import { handlePopupExportBuildPackageRuntime } from '../package';
import { handlePopupExportCancelRuntime } from './cancel';
import type { PopupSendResponse } from '../../helpers/messaging';
import type { PopupExportRequest } from '../../helpers/request/types';
import type { PopupExportRequestHandlerRuntime } from '../types';

type PopupExportRequestHandlerProps = PopupExportRequestHandlerRuntime & {
  request: PopupExportRequest;
  sendResponse: PopupSendResponse;
};

export function dispatchPopupExportRequest(props: PopupExportRequestHandlerProps): boolean {
  switch (props.request.type) {
    case MessageType.EXPORT_POPUP_PREVIEW:
      void respondWithPopupPreview({
        parseTree: props.parseTree,
        sendResponse: props.sendResponse,
      });
      return true;

    case MessageType.EXPORT_POPUP_BUILD_PACKAGE:
      return handlePopupExportBuildPackageRuntime({
        ...props,
        request: props.request,
        sendResponse: props.sendResponse,
      });

    case MessageType.EXPORT_POPUP_CANCEL:
      return handlePopupExportCancelRuntime({
        exportRunId: props.request.exportRunId,
        exportRunner: props.exportRunner,
        sendResponse: props.sendResponse,
        state: props.state,
      });

    default:
      return false;
  }
}
