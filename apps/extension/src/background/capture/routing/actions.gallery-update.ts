import { beginPageAppearance } from '../quick-actions/appearance';
import { saveScreenshotToMediaHubFromDataUrl } from '../../media-hub/assets';
import { createRouteErrorResponse } from '../../routing-contracts/response';
import type { SendResponse } from './types';
import { loadSettings } from '../../../composition/persistence/settings';
import { DEFAULT_LOCAL_STORAGE_POLICY } from '../../../composition/persistence/library-lifecycle';
import { issueRecentCaptureEditorAssetCapability } from '../editor/recent-asset-capability';
import type { PreauthorizedContentActionBinding } from '../../routing-contracts/capabilities/content-action/route';

export function handleSaveScreenshotToGallery(
  payload: { dataUrl: string; filename: string; quickActionTransactionId?: string },
  resolvedTabId: number,
  sendResponse: SendResponse,
  contentPreauthorization?: PreauthorizedContentActionBinding
): boolean {
  let appearance: ReturnType<typeof beginPageAppearance>;
  try {
    appearance = beginPageAppearance(resolvedTabId, payload.quickActionTransactionId);
  } catch (error) {
    sendResponse(createRouteErrorResponse(error));
    return true;
  }
  const authorization = contentPreauthorization;
  let prepared = { dataUrl: payload.dataUrl, filename: payload.filename };
  const authorizedDestination: 'library' | null = authorization?.libraryDestinationAuthorized
    ? 'library'
    : null;
  const savePromise = (async () => {
    if (appearance.prepare) prepared = await appearance.prepare(payload.dataUrl, payload.filename);
    const storageClass =
      authorizedDestination ??
      (await loadSettings()
        .then((settings) => settings.localStoragePolicy.defaultDestination)
        .catch(() => DEFAULT_LOCAL_STORAGE_POLICY.defaultDestination));
    appearance.assertCurrent();
    return saveScreenshotToMediaHubFromDataUrl(
      prepared.dataUrl,
      prepared.filename,
      resolvedTabId,
      storageClass
    );
  })();
  savePromise
    .then((assetId) => {
      appearance.assertCurrent();
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
        ...(appearance.prepare ? prepared : {}),
        ...(editorAssetCapability ? { editorAssetCapability } : {}),
      });
    })
    .catch((error) => sendResponse(createRouteErrorResponse(error)))
    .finally(() => appearance.release());
  return true;
}
