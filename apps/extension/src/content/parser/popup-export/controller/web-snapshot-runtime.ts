import { saveCurrentPageWebSnapshot } from '../../web-snapshot/save';
import type { PopupSendResponse } from '../helpers';

export function handlePopupWebSnapshotRuntime(
  sendResponse: PopupSendResponse,
  requestId: string,
  allowAuthenticatedSameOriginAssets: boolean,
  allowAnonymousCrossOriginAssets: boolean
): boolean {
  saveCurrentPageWebSnapshot({
    allowAnonymousCrossOriginAssets,
    allowAuthenticatedSameOriginAssets,
    requestId,
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
    });
  return true;
}
