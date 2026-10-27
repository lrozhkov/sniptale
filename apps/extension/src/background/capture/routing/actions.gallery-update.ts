import {
  acquireMediaMutationPermit,
  getMediaAuthorityGeneration,
} from '../../mutation-exclusion/media-activity';
import type { CaptureActionType } from '../../../contracts/settings';
import { finalizeScreenshotDataUrl } from '../../../platform/media-utils/screenshot-encoding';
import { getQuickActionAppearanceSnapshot } from '../quick-actions/flow/surface';
import { beginPageAppearance } from '../quick-actions/appearance';
import { saveScreenshotToMediaHubFromDataUrl } from '../../media-hub/assets';
import { createRouteErrorResponse } from '../../routing-contracts/response';
import type { SendResponse } from './types';
import { loadSettings } from '../../../composition/persistence/settings';
import { DEFAULT_LOCAL_STORAGE_POLICY } from '../../../composition/persistence/library-lifecycle';
import { issueRecentCaptureEditorAssetCapability } from '../editor/recent-asset-capability';
import type { PreauthorizedContentActionBinding } from '../../routing-contracts/capabilities/content-action/route';

export function handleSaveScreenshotToGallery(
  payload: {
    dataUrl: string;
    filename: string;
    quickActionTransactionId?: string;
    actionType?: CaptureActionType;
  },
  resolvedTabId: number,
  sendResponse: SendResponse,
  contentPreauthorization?: PreauthorizedContentActionBinding
): boolean {
  const releasePermit = acquireMediaMutationPermit();
  if (!releasePermit) {
    sendResponse(createRouteErrorResponse(new Error('Local data erasure is in progress')));
    return true;
  }
  const generation = getMediaAuthorityGeneration();
  let appearance: ReturnType<typeof beginPageAppearance>;
  try {
    appearance =
      payload.actionType === 'copy'
        ? beginPageAppearance(resolvedTabId, payload.quickActionTransactionId, 'png')
        : beginPageAppearance(resolvedTabId, payload.quickActionTransactionId);
  } catch (error) {
    releasePermit();
    sendResponse(createRouteErrorResponse(error));
    return true;
  }
  const assertCurrent = () => {
    if (generation !== getMediaAuthorityGeneration())
      throw new Error('Screenshot preparation was cancelled');
    appearance.assertCurrent();
  };
  const authorization = contentPreauthorization;
  let prepared = { dataUrl: payload.dataUrl, filename: payload.filename };
  const authorizedDestination: 'library' | null = authorization?.libraryDestinationAuthorized
    ? 'library'
    : null;
  const savePromise = (async () => {
    if (appearance.prepare) {
      prepared = await appearance.prepare(payload.dataUrl, payload.filename);
    } else {
      const output = payload.quickActionTransactionId
        ? getQuickActionAppearanceSnapshot(resolvedTabId, payload.quickActionTransactionId)
        : await loadSettings();
      assertCurrent();
      const format = payload.actionType === 'copy' ? 'png' : output.imageFormat;
      prepared = {
        dataUrl: await finalizeScreenshotDataUrl(payload.dataUrl, {
          format,
          quality: output.imageQuality,
        }),
        filename: payload.filename.replace(/\.[^.]+$/, `.${format === 'jpeg' ? 'jpg' : format}`),
      };
    }
    const storageClass =
      authorizedDestination ??
      (await loadSettings()
        .then((settings) => settings.localStoragePolicy.defaultDestination)
        .catch(() => DEFAULT_LOCAL_STORAGE_POLICY.defaultDestination));
    assertCurrent();
    return saveScreenshotToMediaHubFromDataUrl(
      prepared.dataUrl,
      prepared.filename,
      resolvedTabId,
      storageClass
    );
  })();
  savePromise
    .then((assetId) => {
      assertCurrent();
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
        ...prepared,
        ...(editorAssetCapability ? { editorAssetCapability } : {}),
      });
    })
    .catch((error) => sendResponse(createRouteErrorResponse(error)))
    .finally(() => {
      try {
        appearance.release();
      } finally {
        releasePermit();
      }
    });
  return true;
}
