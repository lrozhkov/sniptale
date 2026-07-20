import {
  isOffscreenOnlyVideoRuntimeMessage,
  routeVideoRuntimeMessage,
} from '../../../media/routes';
import type { ProjectExportPreauthorization } from '../../../routing-contracts/project-export-preauthorization';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { createRouteErrorResponse } from '../../../routing-contracts/response';
import { authorizeIPCMessage, authorizeProjectExportRuntimeMessage } from '../authorization/index';
import type { IpcPreauthorization } from '../../../routing-contracts/authorization-result';
import type { ActionResult, VideoRuntimeAction } from './types';

export function routeVideoRuntimeAction(action: VideoRuntimeAction): ActionResult {
  if (rejectUnauthorizedOffscreenRuntimeAction(action)) {
    return { handled: true, keepChannelOpen: false };
  }

  if (isProjectExportAuthorizationRoute(action)) {
    void authorizeProjectExportRuntimeMessage({
      message: action.message,
      sender: action.context.sender,
    })
      .then((authorization) => {
        if (!authorization.authorized) {
          action.context.sendResponse(createRouteErrorResponse(authorization.reason));
          return;
        }
        routeAuthorizedVideoRuntimeAction(
          action,
          getProjectExportPreauthorization(authorization.preauthorization)
        );
      })
      .catch((error: unknown) => {
        action.context.sendResponse(createRouteErrorResponse(error));
      });
    return { handled: true, keepChannelOpen: true };
  }

  return routeAuthorizedVideoRuntimeAction(action);
}

function getProjectExportPreauthorization(
  preauthorization: IpcPreauthorization | undefined
): ProjectExportPreauthorization | undefined {
  return preauthorization?.kind === 'project-export' ? preauthorization : undefined;
}

function routeAuthorizedVideoRuntimeAction(
  action: VideoRuntimeAction,
  preauthorization?: ProjectExportPreauthorization
): ActionResult {
  const videoRuntimeRoute = routeVideoRuntimeMessage(
    action.message,
    action.context.sendResponse,
    action.context.tabId ?? undefined,
    action.context.sender,
    preauthorization
  );
  if (videoRuntimeRoute.handled) {
    return { handled: true, keepChannelOpen: videoRuntimeRoute.keepChannelOpen };
  }

  return { handled: false };
}

function isProjectExportAuthorizationRoute(action: VideoRuntimeAction): boolean {
  return (
    action.message.type === VideoMessageType.START_PROJECT_EXPORT ||
    action.message.type === VideoMessageType.CANCEL_PROJECT_EXPORT
  );
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
