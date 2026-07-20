import type { PopupSendResponse } from '../../../helpers';
import type { PopupExportRequest } from '../../../helpers/request/types';
import type { PopupExportRequestHandlerRuntime } from './runtime';

export type PopupExportRequestHandlerProps = PopupExportRequestHandlerRuntime & {
  request: PopupExportRequest;
  sendResponse: PopupSendResponse;
};
