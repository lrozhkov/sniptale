import {
  isOffscreenOnlyVideoRuntimeMessage,
  routeVideoRuntimeMessage,
} from '../../../media/routes';
import { createRouteErrorResponse } from '../../../routing-contracts/response';
import { authorizeIPCMessage } from '../authorization/index';
import type { ActionResult, VideoRuntimeAction } from './types';

export function routeVideoRuntimeAction(action: VideoRuntimeAction): ActionResult {
  if (rejectUnauthorizedOffscreenRuntimeAction(action)) {
    return { handled: true, keepChannelOpen: false };
  }

  return routeAuthorizedVideoRuntimeAction(action);
}

function routeAuthorizedVideoRuntimeAction(action: VideoRuntimeAction): ActionResult {
  const videoRuntimeRoute = routeVideoRuntimeMessage(
    action.message,
    action.context.sendResponse,
    action.context.tabId ?? undefined,
    action.context.sender
  );
  if (videoRuntimeRoute.handled) {
    return { handled: true, keepChannelOpen: videoRuntimeRoute.keepChannelOpen };
  }

  return { handled: false };
}

function rejectUnauthorizedOffscreenRuntimeAction(action: VideoRuntimeAction): boolean {
  if (!isOffscreenOnlyVideoRuntimeMessage(action.message)) {
    return false;
  }

  const authorization = authorizeIPCMessage({
    kind: 'offscreen-runtime',
    message: action.message,
    sender: action.context.sender,
  });
  if (authorization.authorized) {
    return false;
  }

  action.context.logger.warn('Rejected offscreen-only runtime message from untrusted sender', {
    senderUrl: action.context.senderUrl,
    type: action.message.type,
  });
  action.context.sendResponse(createRouteErrorResponse(authorization.reason));
  return true;
}
