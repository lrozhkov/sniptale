import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoRuntimeMessage } from '../../../../contracts/video/types/messages';
import { resolveExtensionDocumentSenderUrl } from '../../../../platform/runtime-messaging/document-sender';

const CAMERA_RECORDER_DOCUMENT_PATH = 'apps/extension/src/camera-recorder/index.html';
const POPUP_DOCUMENT_PATH = 'apps/extension/src/popup/index.html';
const VIDEO_EDITOR_DOCUMENT_PATH = 'apps/extension/src/video-editor/index.html';

type TrustedVideoEditorRuntimeSender = {
  documentId: string;
  senderUrl: string;
};

const offscreenOnlyRuntimeTypes = new Set<VideoRuntimeMessage['type']>([
  VideoMessageType.RECORDING_DURATION_UPDATED,
  VideoMessageType.OFFSCREEN_READY,
  VideoMessageType.OFFSCREEN_RECORDING_STARTED,
  VideoMessageType.OFFSCREEN_SOURCE_READY,
  VideoMessageType.OFFSCREEN_RECORDING_STOPPED,
  VideoMessageType.OFFSCREEN_RECORDING_PAUSED,
  VideoMessageType.OFFSCREEN_RECORDING_RESUMED,
  VideoMessageType.OFFSCREEN_ERROR,
  VideoMessageType.PROJECT_EXPORT_PROGRESS,
  VideoMessageType.PROJECT_EXPORT_COMPLETED,
  VideoMessageType.PROJECT_EXPORT_FAILED,
  VideoMessageType.PROJECT_EXPORT_CANCELLED,
  VideoMessageType.DESKTOP_MEDIA_OBTAINED,
  VideoMessageType.DESKTOP_MEDIA_CANCELLED,
  VideoMessageType.DESKTOP_MEDIA_FAILED,
  VideoMessageType.DOWNLOAD_RECORDING_SIDECAR,
  VideoMessageType.DOWNLOAD_RECORDING,
  VideoMessageType.VIDEO_SAVED_TO_IDB,
]);

export function isOffscreenOnlyVideoRuntimeMessage(message: VideoRuntimeMessage): boolean {
  return offscreenOnlyRuntimeTypes.has(message.type);
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
