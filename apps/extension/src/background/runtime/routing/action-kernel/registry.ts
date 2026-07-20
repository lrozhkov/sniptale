import type {
  Action,
  ActionRouteHandlerAdapter,
  ActionRouteMetadata,
  ActionHandler,
  ActionResult,
  BackgroundOwnedAction,
  InternalSignalAction,
  LegacyRouteName,
  TabAction,
  UnknownAction,
  VideoRuntimeAction,
} from './types';
import { actionRouteMetadata, getActionRouteMetadata } from './routes';
import {
  handleBackgroundOwnedAction,
  handleInternalSignalAction,
  handleTabAction,
  handleUnknownAction,
  handleVideoRuntimeAction,
} from './handlers';

type RegistryEntry = ActionRouteMetadata & { readonly handler: ActionHandler };

export const legacyActionRouteRegistry = actionRouteMetadata.map((entry) => ({
  ...entry,
  handler: getHandlerAdapter(entry.handlerAdapter),
})) satisfies readonly RegistryEntry[];

export function getActionRouteHandler(routeName: LegacyRouteName): ActionHandler | undefined {
  return legacyActionRouteRegistry.find((entry) => entry.routeName === routeName)?.handler;
}

export { actionRouteMetadata, getActionRouteMetadata };

function getHandlerAdapter(adapter: ActionRouteHandlerAdapter): ActionHandler {
  switch (adapter) {
    case 'routeBackgroundOwnedAction':
      return routeBackgroundOwnedAction;
    case 'routeInternalSignalAction':
      return routeInternalSignalAction;
    case 'routeTabAction':
      return routeTabAction;
    case 'routeUnknownAction':
      return routeUnknownAction;
    case 'routeVideoRuntimeAction':
      return routeVideoRuntimeAction;
  }
}

function routeInternalSignalAction(action: Action): ActionResult {
  return isInternalSignalAction(action) ? handleInternalSignalAction(action) : { handled: false };
}

function routeUnknownAction(action: Action): ActionResult {
  return isUnknownAction(action) ? handleUnknownAction(action) : { handled: false };
}

function routeBackgroundOwnedAction(action: Action): ActionResult {
  return isBackgroundOwnedAction(action) ? handleBackgroundOwnedAction(action) : { handled: false };
}

function routeTabAction(action: Action): ActionResult {
  return isTabAction(action) ? handleTabAction(action) : { handled: false };
}

function routeVideoRuntimeAction(action: Action): ActionResult {
  return isVideoRuntimeAction(action) ? handleVideoRuntimeAction(action) : { handled: false };
}

function isInternalSignalAction(action: Action): action is InternalSignalAction {
  return action.actionKind === 'internal-signal';
}

function isUnknownAction(action: Action): action is UnknownAction {
  return action.actionKind === 'unknown';
}

function isBackgroundOwnedAction(action: Action): action is BackgroundOwnedAction {
  return action.actionKind === 'background-owned';
}

function isTabAction(action: Action): action is TabAction {
  return action.actionKind === 'tab';
}

function isVideoRuntimeAction(action: Action): action is VideoRuntimeAction {
  return action.actionKind === 'video-runtime';
}
