import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { runtimeActionExportMessageContracts } from '../../../../contracts/messaging/contracts/runtime/actions/export';
import { createRouteErrorResponse } from '../../../routing-contracts/response';
import {
  acknowledgePagePackageJobStatus,
  cancelPagePackageJob,
  getPagePackageJobSnapshot,
  startPagePackageJobFromSources,
} from './index';
import type { PopupExportJobContentPort } from './runtime-state';

export function routePagePackageJobMessage(
  message: unknown,
  sendResponse: ResponseSender,
  contentPort: PopupExportJobContentPort
): boolean {
  if (!message || typeof message !== 'object' || !('type' in message)) return false;
  const request = message as Record<string, unknown>;
  let work: Promise<unknown>;
  switch (request['type']) {
    case MessageType.START_PAGE_PACKAGE_JOB: {
      const parsed =
        runtimeActionExportMessageContracts[MessageType.START_PAGE_PACKAGE_JOB].parseRequest(
          message
        );
      work = startPagePackageJobFromSources({ ...parsed, contentPort }).then((status) => ({
        success: true,
        status,
      }));
      break;
    }
    case MessageType.GET_PAGE_PACKAGE_JOB_STATUS: {
      const parsed =
        runtimeActionExportMessageContracts[MessageType.GET_PAGE_PACKAGE_JOB_STATUS].parseRequest(
          message
        );
      work = getPagePackageJobSnapshot(parsed.jobId).then((snapshot) => ({
        success: true,
        ...snapshot,
      }));
      break;
    }
    case MessageType.CANCEL_PAGE_PACKAGE_JOB: {
      const parsed =
        runtimeActionExportMessageContracts[MessageType.CANCEL_PAGE_PACKAGE_JOB].parseRequest(
          message
        );
      work = cancelPagePackageJob(parsed.jobId).then((status) => ({
        success: true,
        status,
      }));
      break;
    }
    case MessageType.ACK_PAGE_PACKAGE_JOB_STATUS: {
      const parsed =
        runtimeActionExportMessageContracts[MessageType.ACK_PAGE_PACKAGE_JOB_STATUS].parseRequest(
          message
        );
      work = acknowledgePagePackageJobStatus(parsed.jobId).then((status) => ({
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
