import type { PopupSendResponse } from '../../helpers/messaging';
import { parsePopupExportRequest } from '../../helpers/request/parse';
import { dispatchPopupExportRequest } from './dispatch';
import type { PopupExportRequestHandlerRuntime } from '../types';

export function createPopupExportRequestHandler(
  props: PopupExportRequestHandlerRuntime
): (request: unknown, sendResponse: PopupSendResponse) => boolean {
  return (request: unknown, sendResponse: PopupSendResponse): boolean => {
    const typedRequest = parsePopupExportRequest(request);
    if (!typedRequest) {
      return false;
    }
    return dispatchPopupExportRequest({
      ...props,
      request: typedRequest,
      sendResponse,
    });
  };
}
