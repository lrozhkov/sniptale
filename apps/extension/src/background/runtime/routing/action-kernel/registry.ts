import type {
  Action,
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
import type { BackgroundIngressHandlerId } from '../../../../contracts/messaging/contracts/runtime';
import { actionRouteMetadata, getActionRouteMetadata } from './routes';
import {
  handleBackgroundOwnedAction,
  handleInternalSignalAction,
  handleProjectExportCapabilitiesAction,
  handleProjectExportRuntimeAction,
  handleTabAction,
  handleUnknownAction,
  handleVideoRuntimeAction,
} from './handlers';

type RegistryEntry = ActionRouteMetadata & { readonly handler: ActionHandler };

type ActionRouteHandlerId = BackgroundIngressHandlerId | 'internal-signal' | 'unknown';

export const actionRouteHandlerBindings = {
  'aggregate-promotion': routeBackgroundOwnedAction,
  'ai-secret-unlock': routeBackgroundOwnedAction,
  'ai-settings-mutation': routeBackgroundOwnedAction,
  'ai-settings-navigation': routeBackgroundOwnedAction,
  'ai-settings-query': routeBackgroundOwnedAction,
  'annotation-fork-session': routeBackgroundOwnedAction,
  capture: routeTabAction,
  'content-action-capability-issuance': routeBackgroundOwnedAction,
  'content-runtime-wakeup': routeBackgroundOwnedAction,
  'frame-annotation-raster': routeBackgroundOwnedAction,
  'internal-signal': routeInternalSignalAction,
  'llm-content-processing': routeBackgroundOwnedAction,
  'llm-scenario-editor-processing': routeBackgroundOwnedAction,
  'llm-session': routeBackgroundOwnedAction,
  'local-data-erasure': routeBackgroundOwnedAction,
  'native-app-runtime': routeBackgroundOwnedAction,
  'page-access': routeBackgroundOwnedAction,
  'popup-export': routeTabAction,
  'popup-export-job': routeBackgroundOwnedAction,
  'popup-tab-route-capability-issuance': routeBackgroundOwnedAction,
  'project-export-capabilities': routeProjectExportCapabilitiesAction,
  'project-export-runtime': routeProjectExportRuntimeAction,
  scenario: routeTabAction,
  'settings-transfer': routeBackgroundOwnedAction,
  'tab-mode': routeTabAction,
  unknown: routeUnknownAction,
  'video-control': routeTabAction,
  'video-recording-surface': routeTabAction,
  'video-runtime': routeVideoRuntimeAction,
  'voice-input-offscreen-event': routeBackgroundOwnedAction,
} satisfies Record<ActionRouteHandlerId, ActionHandler>;

export const legacyActionRouteRegistry = actionRouteMetadata.map((entry) => ({
  ...entry,
  handler: getHandlerBinding(entry.handlerId as ActionRouteHandlerId),
})) satisfies readonly RegistryEntry[];

export function getActionRouteHandler(routeName: LegacyRouteName): ActionHandler | undefined {
  return legacyActionRouteRegistry.find((entry) => entry.routeName === routeName)?.handler;
}

export { actionRouteMetadata, getActionRouteMetadata };

function getHandlerBinding(handlerId: ActionRouteHandlerId): ActionHandler {
  return actionRouteHandlerBindings[handlerId];
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

function routeProjectExportRuntimeAction(action: Action): ActionResult {
  return isVideoRuntimeAction(action)
    ? handleProjectExportRuntimeAction(action)
    : { handled: false };
}

function routeProjectExportCapabilitiesAction(action: Action): ActionResult {
  return isVideoRuntimeAction(action)
    ? handleProjectExportCapabilitiesAction(action)
    : { handled: false };
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
