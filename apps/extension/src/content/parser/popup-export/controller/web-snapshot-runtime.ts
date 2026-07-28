import { saveCurrentPageWebSnapshot } from '../../web-snapshot/save';
import type { PopupSendResponse } from '../helpers/messaging';
import type * as ContentIntentTypes from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import type { FullPageExportCaptureAction } from '../../../../contracts/full-page-capture';

export function handlePopupWebSnapshotRuntime(
  sendResponse: PopupSendResponse,
  requestId: string,
  allowAuthenticatedSameOriginAssets: boolean,
  allowAnonymousCrossOriginAssets: boolean,
  contentIntentGrant?: ContentIntentTypes.ContentPrivilegedActionAutoStartGrant,
  fullPageCaptureAction?: FullPageExportCaptureAction,
  abortSignal?: AbortSignal,
  onSettled?: () => void
): boolean {
  saveCurrentPageWebSnapshot({
    allowAnonymousCrossOriginAssets,
    allowAuthenticatedSameOriginAssets,
    requestId,
    ...(contentIntentGrant === undefined ? {} : { contentIntentGrant }),
    ...(fullPageCaptureAction === undefined ? {} : { fullPageCaptureAction }),
    ...(abortSignal === undefined ? {} : { abortSignal }),
  })
    .then((response) => {
      sendResponse(response);
    })
    .catch((error) => {
      sendResponse({
        error: error instanceof Error ? error.message : String(error),
        success: false,
        warnings: [],
      });
    })
    .finally(() => onSettled?.());
  return true;
}
