import { createRouteErrorResponse } from '../../../routing-contracts/response';
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

export function handleTabAction(action: TabAction): ActionResult {
  return routeTabAction(action);
}
