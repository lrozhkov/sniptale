import { saveScreenshotToMediaHubFromDataUrl } from '../../media-hub/assets';
import { createRouteErrorResponse } from '../../routing-contracts/response';
import type { SendResponse } from './types';
import { loadSettings } from '../../../composition/persistence/settings';
import { DEFAULT_LOCAL_STORAGE_POLICY } from '../../../composition/persistence/library-lifecycle';
import { getPreauthorizedContentActionRouteMessage } from './authorization/content-action';
import { issueRecentCaptureEditorAssetCapability } from '../editor/recent-asset-capability';

export function handleSaveScreenshotToGallery(
  payload: { dataUrl: string; filename: string },
  resolvedTabId: number,
  sendResponse: SendResponse
): boolean {
  const authorization = getPreauthorizedContentActionRouteMessage(payload);
  const authorizedDestination: 'library' | null = authorization?.libraryDestinationAuthorized
    ? 'library'
    : null;
  const savePromise = (
    authorizedDestination
      ? Promise.resolve(authorizedDestination)
      : loadSettings()
          .then((settings) => settings.localStoragePolicy.defaultDestination)
          .catch(() => DEFAULT_LOCAL_STORAGE_POLICY.defaultDestination)
  ).then((storageClass) =>
    saveScreenshotToMediaHubFromDataUrl(
      payload.dataUrl,
      payload.filename,
      resolvedTabId,
      storageClass
    )
  );
  savePromise
    .then((assetId) => {
      const editorAssetCapability = authorization
        ? issueRecentCaptureEditorAssetCapability({
            assetId,
            requestId: authorization.requestId,
            senderBinding: authorization,
          })
        : undefined;
      sendResponse({
        success: true,
        assetId,
        ...(editorAssetCapability ? { editorAssetCapability } : {}),
      });
    })
    .catch((error) => sendResponse(createRouteErrorResponse(error)));
  return true;
}
