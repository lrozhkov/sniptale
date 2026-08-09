import {
  saveScreenshotToMediaHubFromDataUrl,
  updateGalleryImageAssetFromDataUrl,
} from '../../media-hub/assets';
import { createRouteErrorResponse } from '../../routing-contracts/response';
import type { SendResponse } from './types';
import { issueGalleryImageUpdateCapability } from './gallery-update-capabilities';
import * as authorizationPreauthorization from './authorization/gallery-update';
import { loadSettings } from '../../../composition/persistence/settings';
import { DEFAULT_LOCAL_STORAGE_POLICY } from '../../../composition/persistence/library-lifecycle';
import { getPreauthorizedContentActionRouteMessage } from './authorization/content-action';

const recentCaptureAssetsByTab = new Map<number, { assetId: string; expiresAt: number }>();

export function consumeRecentCaptureAssetBinding(tabId: number, assetId: string): boolean {
  const binding = recentCaptureAssetsByTab.get(tabId);
  recentCaptureAssetsByTab.delete(tabId);
  return Boolean(binding && binding.assetId === assetId && binding.expiresAt > Date.now());
}

function readEditorUrlParam(senderUrl: string, key: string): string | null {
  try {
    return new URL(senderUrl).searchParams.get(key);
  } catch {
    return null;
  }
}

function readRequiredSenderDocumentId(
  sender: chrome.runtime.MessageSender | undefined
): string | null {
  return typeof sender?.documentId === 'string' && sender.documentId.length > 0
    ? sender.documentId
    : null;
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

export function handleUpdateGalleryImageAsset(
  payload: {
    assetId: string;
    dataUrl: string;
    editorSessionId: string;
    filename?: string;
    updateCapabilityToken: string;
  },
  _sender: chrome.runtime.MessageSender | undefined,
  sendResponse: SendResponse
): boolean {
  if (!authorizationPreauthorization.hasPreauthorizedGalleryUpdateRouteMessage(payload)) {
    sendResponse(createRouteErrorResponse('Unauthorized gallery image update'));
    return true;
  }

  updateGalleryImageAssetFromDataUrl(payload.assetId, payload.dataUrl, payload.filename)
    .then((assetId) => sendResponse({ success: true, assetId }))
    .catch((error) => sendResponse(createRouteErrorResponse(error)));
  return true;
}

export function handleRequestGalleryImageUpdateCapability(
  payload: { assetId: string; editorSessionId: string },
  sender: chrome.runtime.MessageSender | undefined,
  sendResponse: SendResponse
): boolean {
  const senderUrl = sender?.url;
  const senderDocumentId = readRequiredSenderDocumentId(sender);
  if (
    !senderUrl ||
    !senderDocumentId ||
    readEditorUrlParam(senderUrl, 'assetId') !== payload.assetId ||
    readEditorUrlParam(senderUrl, 'session') !== payload.editorSessionId
  ) {
    sendResponse(createRouteErrorResponse('Unauthorized gallery image update capability request'));
    return true;
  }

  const updateCapabilityToken = issueGalleryImageUpdateCapability({
    assetId: payload.assetId,
    documentId: senderDocumentId,
    editorSessionId: payload.editorSessionId,
    senderUrl,
  });
  sendResponse({ success: true, updateCapabilityToken });
  return true;
}
