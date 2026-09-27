import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { browserScripting } from '@sniptale/platform/browser/scripting';
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
      work = (async () => {
        if (parsed.sourceDocumentId !== undefined) {
          const [source] = parsed.sources;
          if (parsed.sources.length !== 1 || source?.kind !== 'tab') {
            throw new Error('Document-bound Page Package jobs require exactly one tab source.');
          }
          const [injection] = await browserScripting.executeScript({
            func: () => undefined,
            target: { documentIds: [parsed.sourceDocumentId], tabId: source.tabId },
          });
          if (injection?.documentId !== parsed.sourceDocumentId) {
            throw new Error('The source page changed before export could start.');
          }
        }
        const status = await startPagePackageJobFromSources({ ...parsed, contentPort });
        return { success: true, status };
      })();
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
