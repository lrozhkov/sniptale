import { translate } from '../../../../platform/i18n';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';
import { MAX_CLIPBOARD_TEXT_LENGTH } from '@sniptale/runtime-contracts/validation/text';
import { copyImageToClipboard } from '../../clipboard-image';
import type {
  RuntimeMessageBridgeParams,
  RuntimeMessageRequest,
  RuntimeMessageResponse,
} from './types';

export function handleQuickActionUiMessage(
  request: RuntimeMessageRequest,
  params: RuntimeMessageBridgeParams,
  sendResponse: (response?: RuntimeMessageResponse) => void
): boolean {
  if (request.type === MessageType.SHOW_QUICK_ACTION_COUNTDOWN) {
    params.quickAction.setQuickActionToastCountdown(request.seconds ?? null);
    sendResponse({ success: true });
    return true;
  }

  if (request.type === MessageType.SHOW_TOAST) {
    const message = request.payload?.message;

    if (message) {
      showToast(message, request.payload?.type ?? 'info');
    }

    sendResponse({ success: true });
    return true;
  }

  if (handleCopyTextMessage(request, sendResponse)) {
    return true;
  }

  return handleCopyImageMessage(request, sendResponse);
}

function handleCopyImageMessage(
  request: RuntimeMessageRequest,
  sendResponse: (response?: RuntimeMessageResponse) => void
): boolean {
  if (request.type !== MessageType.COPY_IMAGE_TO_CLIPBOARD || !request.dataUrl) {
    return false;
  }

  if (!isImageDataUrl(request.dataUrl)) {
    sendResponse({
      success: false,
      error: translate('content.runtime.invalidImageData'),
    });
    return true;
  }

  void copyImageToClipboard(request.dataUrl)
    .then(() => {
      sendResponse({ success: true });
    })
    .catch((error) => {
      sendResponse({
        success: false,
        error:
          error instanceof Error ? error.message : translate('content.runtime.copyImageFailed'),
      });
    });

  return true;
}

function handleCopyTextMessage(
  request: RuntimeMessageRequest,
  sendResponse: (response?: RuntimeMessageResponse) => void
): boolean {
  if (request.type !== MessageType.COPY_TEXT_TO_CLIPBOARD) {
    return false;
  }

  if (!request.text) {
    sendResponse({
      success: false,
      error: translate('content.runtime.copyTextFailed'),
    });
    return true;
  }

  if (request.text.length > MAX_CLIPBOARD_TEXT_LENGTH) {
    sendResponse({
      success: false,
      error: translate('content.runtime.clipboardTextTooLarge'),
    });
    return true;
  }

  if (request.html && request.html.length > MAX_CLIPBOARD_TEXT_LENGTH) {
    sendResponse({
      success: false,
      error: translate('content.runtime.clipboardTextTooLarge'),
    });
    return true;
  }

  void writeClipboardTextPayload(request)
    .then(() => {
      sendResponse({ success: true });
    })
    .catch((error) => {
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : translate('content.runtime.copyTextFailed'),
      });
    });

  return true;
}

async function writeClipboardTextPayload(request: RuntimeMessageRequest): Promise<void> {
  if (!request.html || !navigator.clipboard.write || typeof ClipboardItem === 'undefined') {
    await navigator.clipboard.writeText(request.text ?? '');
    return;
  }

  const item = new ClipboardItem({
    'text/html': new Blob([request.html], { type: 'text/html' }),
    'text/plain': new Blob([request.text ?? ''], { type: 'text/plain' }),
  });

  await navigator.clipboard.write([item]);
}
