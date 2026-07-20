import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  RuntimeMessageBridgeParams,
  RuntimeMessageRequest,
  RuntimeMessageResponse,
} from './types';

export function handleToolbarVisibilityMessage(
  request: RuntimeMessageRequest,
  params: RuntimeMessageBridgeParams,
  sendResponse: (response?: RuntimeMessageResponse) => void
): boolean {
  if (request.type === MessageType.SHOW_TOOLBAR) {
    params.modeControls.setIsToolbarVisible(true);
    sendResponse({ success: true });
    return true;
  }

  if (request.type === MessageType.HIDE_TOOLBAR) {
    params.modeControls.setIsToolbarVisible(false);
    sendResponse({ success: true });
    return true;
  }

  if (request.type === MessageType.TOOLBAR_STATUS) {
    sendResponse({ success: true, visible: params.modeState.isToolbarVisible });
    return true;
  }

  return false;
}
