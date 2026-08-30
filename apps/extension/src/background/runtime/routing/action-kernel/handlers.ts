import { createRouteErrorResponse } from '../../../routing-contracts/response';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  handleCancelProjectExport,
  handleGetProjectExportCapabilities,
  handleStartProjectExport,
} from '../../../media/video/runtime/handlers/export/project-export';
import { resolveTrustedVideoEditorRuntimeSender } from '../../../media/video/runtime/sender-policy';
import { authorizeProjectExportRuntimeMessage } from '../authorization';
import { routeBackgroundOwnedAction } from './owned-route';
import { routeTabAction } from './tab-route';
import type {
  ActionResult,
  BackgroundOwnedAction,
  InternalSignalAction,
  TabAction,
  UnknownAction,
  VideoRuntimeAction,
} from './types';
import { routeVideoRuntimeAction } from './video-runtime-route';

export function handleInternalSignalAction(_action: InternalSignalAction): ActionResult {
  return { handled: true, keepChannelOpen: false };
}

export function handleUnknownAction(action: UnknownAction): ActionResult {
  action.context.logger.warn('Unknown background runtime message type', {
    type: action.message.type,
  });
  action.context.sendResponse(createRouteErrorResponse('Unknown message type'));
  return { handled: true, keepChannelOpen: false };
}

export function handleBackgroundOwnedAction(action: BackgroundOwnedAction): ActionResult {
  return routeBackgroundOwnedAction(action);
}

export function handleVideoRuntimeAction(action: VideoRuntimeAction): ActionResult {
  return routeVideoRuntimeAction(action);
}

export function handleProjectExportRuntimeAction(action: VideoRuntimeAction): ActionResult {
  if (
    action.message.type !== VideoMessageType.START_PROJECT_EXPORT &&
    action.message.type !== VideoMessageType.CANCEL_PROJECT_EXPORT
  ) {
    return { handled: false };
  }
  const message = action.message;

  void authorizeProjectExportRuntimeMessage({
    message,
    sender: action.context.sender,
  })
    .then((authorization) => {
      if (!authorization.authorized) {
        action.context.sendResponse(createRouteErrorResponse(authorization.reason));
        return;
      }
      if (authorization.preauthorization?.kind !== 'project-export') {
        action.context.sendResponse(createRouteErrorResponse('Missing project export authority'));
        return;
      }

      if (message.type === VideoMessageType.START_PROJECT_EXPORT) {
        respondProjectExportCompletion(
          action,
          handleStartProjectExport(message, authorization.preauthorization)
        );
      } else {
        respondProjectExportCompletion(action, handleCancelProjectExport(message));
      }
    })
    .catch((error: unknown) => {
      action.context.sendResponse(createRouteErrorResponse(error));
    });
  return { handled: true, keepChannelOpen: true };
}

export function handleProjectExportCapabilitiesAction(action: VideoRuntimeAction): ActionResult {
  if (action.message.type !== VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES) {
    return { handled: false };
  }

  const owner = resolveTrustedVideoEditorRuntimeSender(action.context.sender);
  if (!owner) {
    action.context.sendResponse(createRouteErrorResponse('Unauthorized video export sender'));
    return { handled: true, keepChannelOpen: false };
  }

  respondProjectExportCompletion(action, handleGetProjectExportCapabilities(action.message, owner));
  return { handled: true, keepChannelOpen: true };
}

function respondProjectExportCompletion(
  action: VideoRuntimeAction,
  completion: Promise<unknown>
): void {
  void completion.then(
    (response) => action.context.sendResponse(response),
    (error: unknown) => action.context.sendResponse(createRouteErrorResponse(error))
  );
}

export function handleTabAction(action: TabAction): ActionResult {
  return routeTabAction(action);
}
