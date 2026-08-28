import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createRouteErrorResponse } from '../../../routing-contracts/response';
import type { SendResponse } from '../../routing/types';
import { assertActivePopupExportStageBinding } from './active-job';
import { recordPopupExportStagedPage, removePopupExportStagedPage } from './storage';
import { createPagePackageStagingStore } from './staging';

// policyStateId: popup-export-jobs
export const pagePackageJobStaging = createPagePackageStagingStore({
  assertBindingActive: assertActivePopupExportStageBinding,
  onFinalized: recordPopupExportStagedPage,
  onReleased: removePopupExportStagedPage,
});

export function handleStagePagePackageJobChunk(
  payload: {
    base64: string;
    final: boolean;
    jobId: string;
    ordinal: number;
    sequence: number;
    stagedBlobId: string;
    type: typeof MessageType.STAGE_PAGE_PACKAGE_JOB_CHUNK;
  },
  resolvedTabId: number,
  sendResponse: SendResponse
): boolean {
  pagePackageJobStaging
    .append({ ...payload, tabId: resolvedTabId })
    .then((result) => sendResponse({ success: true, ...result }))
    .catch((error) => sendResponse(createRouteErrorResponse(error)));
  return true;
}
