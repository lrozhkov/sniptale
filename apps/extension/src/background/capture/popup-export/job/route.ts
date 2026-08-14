import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { runtimeActionExportMessageContracts } from '../../../../contracts/messaging/contracts/runtime/actions/export';
import { createRouteErrorResponse } from '../../../routing-contracts/response';
import { cancelPopupExportJob, getPopupExportJobStatus, startPopupExportJob } from './index';
import type { PopupExportJobContentPort } from './runtime-state';

export function routePopupExportJobMessage(
  message: unknown,
  sendResponse: ResponseSender,
  contentPort: PopupExportJobContentPort
): boolean {
  if (!message || typeof message !== 'object' || !('type' in message)) return false;
  const request = message as Record<string, unknown>;
  let work: Promise<unknown>;
  switch (request['type']) {
    case MessageType.START_POPUP_EXPORT_JOB: {
      const parsed =
        runtimeActionExportMessageContracts[MessageType.START_POPUP_EXPORT_JOB].parseRequest(
          message
        );
      work = startPopupExportJob({ ...parsed, contentPort }).then((status) => ({
        success: true,
        status,
      }));
      break;
    }
    case MessageType.GET_POPUP_EXPORT_JOB_STATUS: {
      const parsed =
        runtimeActionExportMessageContracts[MessageType.GET_POPUP_EXPORT_JOB_STATUS].parseRequest(
          message
        );
      work = getPopupExportJobStatus(parsed.jobId).then((status) => ({ success: true, status }));
      break;
    }
    case MessageType.CANCEL_POPUP_EXPORT_JOB: {
      const parsed =
        runtimeActionExportMessageContracts[MessageType.CANCEL_POPUP_EXPORT_JOB].parseRequest(
          message
        );
      work = cancelPopupExportJob(parsed.jobId).then((status) => ({
        success: true,
        status,
      }));
      break;
    }
    default:
      return false;
  }
  work.then(sendResponse).catch((error) => sendResponse(createRouteErrorResponse(error)));
  return true;
}
