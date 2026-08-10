import { saveScreenshotToMediaHubFromDataUrl } from '../../media-hub/assets';
import { createRouteErrorResponse } from '../../routing-contracts/response';
import type { SendResponse } from './types';
import { loadSettings } from '../../../composition/persistence/settings';
import { DEFAULT_LOCAL_STORAGE_POLICY } from '../../../composition/persistence/library-lifecycle';
import { getPreauthorizedContentActionRouteMessage } from './authorization/content-action';

const recentCaptureAssetsByTab = new Map<number, { assetId: string; expiresAt: number }>();

export function consumeRecentCaptureAssetBinding(tabId: number, assetId: string): boolean {
  const binding = recentCaptureAssetsByTab.get(tabId);
  recentCaptureAssetsByTab.delete(tabId);
  return Boolean(binding && binding.assetId === assetId && binding.expiresAt > Date.now());
}

export function handleSaveScreenshotToGallery(
  payload: { dataUrl: string; filename: string },
  resolvedTabId: number,
  sendResponse: SendResponse
): boolean {
  const authorizedDestination: 'library' | null = getPreauthorizedContentActionRouteMessage(payload)
    ?.libraryDestinationAuthorized
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
      recentCaptureAssetsByTab.set(resolvedTabId, {
        assetId,
        expiresAt: Date.now() + 60_000,
      });
      sendResponse({ success: true, assetId });
    })
    .catch((error) => sendResponse(createRouteErrorResponse(error)));
  return true;
}
