import { isUiRuntimeBridgeMessage } from '../../../application/message-listener/ownership';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { parseRuntimeMessageRequest } from './guards';
import {
  createPassiveRuntimeMessageHandler,
  handleScreenshotModeMessage,
  handleToolbarVisibilityMessage,
} from './message-helpers';
import type { RuntimeMessageBridgeParams, RuntimeMessageResponse } from './types';

export type {
  RuntimeMessageBridgeDiagnosticControls,
  RuntimeMessageBridgeDialogControls,
  RuntimeMessageBridgeModeControls,
  RuntimeMessageBridgeModeState,
  RuntimeMessageBridgeParams,
  RuntimeMessageBridgeQuickActionControls,
  RuntimeMessageBridgeViewportControls,
} from './types';

function resolveBridgeParams(
  paramsOrGetter: RuntimeMessageBridgeParams | (() => RuntimeMessageBridgeParams)
): RuntimeMessageBridgeParams {
  return typeof paramsOrGetter === 'function' ? paramsOrGetter() : paramsOrGetter;
}

export function createRuntimeMessageHandler(
  paramsOrGetter: RuntimeMessageBridgeParams | (() => RuntimeMessageBridgeParams)
) {
  const getParams = () => resolveBridgeParams(paramsOrGetter);

  return (
    request: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: RuntimeMessageResponse) => void
  ) => {
    if (!isUiRuntimeBridgeMessage(request)) {
      return false;
    }

    const params = getParams();
    const handlePassiveRuntimeMessage = createPassiveRuntimeMessageHandler(params);
    const typedRequest = parseRuntimeMessageRequest(request);
    if (!typedRequest) {
      return false;
    }

    if (handleToolbarVisibilityMessage(typedRequest, params, sendResponse)) {
      return false;
    }

    if (handleScreenshotModeMessage(typedRequest, params, sendResponse)) {
      return (
        typedRequest.type === MessageType.DISABLE_SCREENSHOT_MODE ||
        typedRequest.type === MessageType.DESTROY_UI_TOOLBAR
      );
    }

    return handlePassiveRuntimeMessage(typedRequest, sendResponse);
  };
}
