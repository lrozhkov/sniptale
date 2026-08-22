import type { VideoRuntimeMessage } from '../../../../contracts/video/types/messages';
import {
  getBackgroundIngressDescriptor,
  isBackgroundIngressRouteAuthorizedBy,
} from '../../../../contracts/messaging/contracts/runtime';
import { resolveExtensionDocumentSenderUrl } from '../../../../platform/runtime-messaging/document-sender';

const CAMERA_RECORDER_DOCUMENT_PATH = 'apps/extension/src/camera-recorder/index.html';
const POPUP_DOCUMENT_PATH = 'apps/extension/src/popup/index.html';
const VIDEO_EDITOR_DOCUMENT_PATH = 'apps/extension/src/video-editor/index.html';

type TrustedVideoEditorRuntimeSender = {
  documentId: string;
  senderUrl: string;
};

export function isOffscreenOnlyVideoRuntimeMessage(message: VideoRuntimeMessage): boolean {
  const descriptor = getBackgroundIngressDescriptor(message.type);
  return isBackgroundIngressRouteAuthorizedBy(descriptor, 'offscreen-runtime');
}

export function resolveTrustedVideoEditorRuntimeSenderUrl(
  sender?: chrome.runtime.MessageSender
): string | null {
  return sender ? resolveExtensionDocumentSenderUrl(sender, VIDEO_EDITOR_DOCUMENT_PATH) : null;
}

export function resolveTrustedVideoEditorRuntimeSender(
  sender?: chrome.runtime.MessageSender
): TrustedVideoEditorRuntimeSender | null {
  const senderUrl = resolveTrustedVideoEditorRuntimeSenderUrl(sender);
  if (!senderUrl) {
    return null;
  }
  if (typeof sender?.documentId !== 'string' || sender.documentId.length === 0) {
    return null;
  }

  return {
    documentId: sender.documentId,
    senderUrl,
  };
}

export function resolveTrustedPopupRuntimeSenderUrl(
  sender?: chrome.runtime.MessageSender
): string | null {
  return sender ? resolveExtensionDocumentSenderUrl(sender, POPUP_DOCUMENT_PATH) : null;
}

export function resolveTrustedCameraRecorderRuntimeSenderUrl(
  sender?: chrome.runtime.MessageSender
): string | null {
  return resolveExtensionDocumentSenderUrl(sender, CAMERA_RECORDER_DOCUMENT_PATH);
}
