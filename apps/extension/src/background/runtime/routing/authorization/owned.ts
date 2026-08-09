import type { AISecretUnlockMessage } from '../../../../contracts/messaging/ai-secret-unlock';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { isOwnedSettingsPage } from '../../../../platform/navigation/extension-pages';
import {
  authorizeContentLlmRoute,
  authorizeAISecretUnlockSender,
  authorizeLlmSessionRequestRoute,
  authorizeScenarioEditorLlmRoute,
} from '../../../ai/routes';
import { isPopupTabRouteSenderUrl } from '../capabilities/popup-tab/route-capabilities';
import { markPreauthorizedPopupTabRouteCapabilityRequestMessage } from '../capabilities/popup-tab/preauthorization';
import { authorizeContentSender } from '../../../routing-contracts/capabilities/content-action/sender-binding';
import { consumeContentPrivilegedActionCapabilityBinding } from '../../../routing-contracts/capabilities/content-action/route';
import {
  AUTHORIZED,
  authorize,
  reject,
  type IpcAuthorizationResult,
} from '../../../routing-contracts/authorization-result';
import type { BackgroundOwnedAuthorizationRequest } from './background-owned.types';
import {
  backgroundOwnedRouteInventory,
  getBackgroundOwnedRouteInventoryEntry,
} from '../action-kernel/owned-route-inventory';
import {
  createBackgroundOwnedRoutePreauthorization,
  type BackgroundOwnedRouteInventoryEntry,
} from '../../../routing-contracts/owned-route-context';
import { authorizeAiSettingsMutationRoute, authorizeAiSettingsQueryRoute } from './ai-settings';
import {
  classifyBackgroundOwnedSender,
  classifySettingsPageSenderUrl,
  isPageAccessSenderUrl,
  isImageEditorSenderUrl,
  isGallerySenderUrl,
  isWebSnapshotViewerSenderUrl,
} from './sender-classification';
import { hasOffscreenRuntimeCapability } from '../../../offscreen-document/sender-policy';

export const backgroundOwnedPolicyAuthorityByMessageType = new Map(
  getBackgroundOwnedPolicyEntries()
);

type BackgroundOwnedAuthorizationDispatcher = {
  readonly authorize: (
    request: BackgroundOwnedAuthorizationRequest,
    entry: BackgroundOwnedRouteInventoryEntry
  ) => IpcAuthorizationResult | Promise<IpcAuthorizationResult>;
  readonly handlerId: BackgroundOwnedRouteInventoryEntry['handlerId'];
  readonly messageTypes: readonly string[];
  readonly ownerModule: string;
  readonly policyAuthorityFamily: string;
};

export const backgroundOwnedAuthorizationDispatchers = backgroundOwnedRouteInventory.map(
  (entry) => ({
    authorize: getBackgroundOwnedAuthorizationHandler(entry.handlerId),
    handlerId: entry.handlerId,
    messageTypes: entry.messageTypes,
    ownerModule: entry.ownerModule,
    policyAuthorityFamily: entry.policyAuthorityFamily,
  })
) as readonly BackgroundOwnedAuthorizationDispatcher[];

function authorizeAiSecretUnlockRoute(
  request: BackgroundOwnedAuthorizationRequest,
  routeEntry: BackgroundOwnedRouteInventoryEntry
): IpcAuthorizationResult {
  const reason = authorizeAISecretUnlockSender(
    request.message as AISecretUnlockMessage,
    request.sender
  );
  if (reason) {
    return reject(reason);
  }
  return authorize(
    createBackgroundOwnedRoutePreauthorization({
      entry: routeEntry,
      handle: { kind: 'ai-secret-unlock-route' },
      message: request.message,
      senderClassification: classifyBackgroundOwnedSender(request.sender),
    })
  );
}

function authorizePageAccessRoute(
  request: BackgroundOwnedAuthorizationRequest
): IpcAuthorizationResult {
  if (!isPageAccessSenderUrl(request.sender.url)) {
    return reject('Unauthorized page access sender');
  }

  return AUTHORIZED;
}

function authorizeAiSettingsNavigationRoute(
  request: BackgroundOwnedAuthorizationRequest,
  routeEntry: BackgroundOwnedRouteInventoryEntry
): IpcAuthorizationResult {
  const senderDecision = authorizeContentSender(request.sender);
  if (!senderDecision.allowed) {
    return reject('Unauthorized AI settings navigation sender');
  }
  const senderBinding = consumeContentPrivilegedActionCapabilityBinding({
    actionType: MessageType.AI_SETTINGS_NAVIGATION,
    contentIntent: request.message['contentIntent'],
    resolvedTabId: senderDecision.principal.tabId,
    sender: request.sender,
  });
  if (!senderBinding) {
    return reject('Unauthorized AI settings navigation intent');
  }
  return authorize(
    createBackgroundOwnedRoutePreauthorization({
      entry: routeEntry,
      handle: { kind: 'background-owned-route-policy' },
      message: request.message,
      senderClassification: 'content-tab-runtime',
    })
  );
}

function authorizeAnnotationForkSessionRoute(
  request: BackgroundOwnedAuthorizationRequest,
  routeEntry: BackgroundOwnedRouteInventoryEntry
): IpcAuthorizationResult {
  const senderDecision = authorizeContentSender(request.sender);
  if (!senderDecision.allowed) return reject('Unauthorized annotation fork session sender');
  return authorize(
    createBackgroundOwnedRoutePreauthorization({
      entry: routeEntry,
      handle: { kind: 'annotation-fork-session', senderBinding: senderDecision.principal },
      message: request.message,
      senderClassification: 'content-tab-runtime',
    })
  );
}

function authorizeFrameAnnotationRasterRoute(
  request: BackgroundOwnedAuthorizationRequest
): IpcAuthorizationResult {
  return isImageEditorSenderUrl(request.sender.url) ||
    isWebSnapshotViewerSenderUrl(request.sender.url)
    ? AUTHORIZED
    : reject('Unauthorized frame annotation raster sender');
}

function authorizeLocalDataErasureRoute(
  request: BackgroundOwnedAuthorizationRequest
): IpcAuthorizationResult {
  return isOwnedSettingsPage(request.sender.url)
    ? AUTHORIZED
    : reject('Unauthorized local data erasure sender');
}

function authorizeAggregatePromotionRoute(
  request: BackgroundOwnedAuthorizationRequest
): IpcAuthorizationResult {
  return isGallerySenderUrl(request.sender.url)
    ? AUTHORIZED
    : reject('Unauthorized aggregate promotion sender');
}

function authorizeNativeAppRoute(
  request: BackgroundOwnedAuthorizationRequest,
  routeEntry: BackgroundOwnedRouteInventoryEntry
): IpcAuthorizationResult {
  if (classifySettingsPageSenderUrl(request.sender.url) !== 'ordinary-settings-page') {
    return reject('Unauthorized native app runtime sender');
  }

  return authorize(
    createBackgroundOwnedRoutePreauthorization({
      entry: routeEntry,
      handle: { kind: 'background-owned-route-policy' },
      message: request.message,
      senderClassification: classifyBackgroundOwnedSender(request.sender),
    })
  );
}

function authorizePopupExportArchiveRoute(
  request: BackgroundOwnedAuthorizationRequest
): IpcAuthorizationResult {
  return isPopupTabRouteSenderUrl(request.sender.url)
    ? AUTHORIZED
    : reject('Unauthorized popup export archive sender');
}

function authorizePopupTabRouteCapabilityIssuance(
  request: BackgroundOwnedAuthorizationRequest
): IpcAuthorizationResult {
  if (!isPopupTabRouteSenderUrl(request.sender.url)) {
    return reject('Unauthorized tab route capability sender');
  }
  markPreauthorizedPopupTabRouteCapabilityRequestMessage(request.message);
  return AUTHORIZED;
}

function authorizeVoiceInputOffscreenEvent(
  request: BackgroundOwnedAuthorizationRequest,
  routeEntry: BackgroundOwnedRouteInventoryEntry
): IpcAuthorizationResult {
  // Chrome may omit documentId for offscreen senders. The canonical policy still binds the
  // sender to this extension's exact offscreen document path and rejects neighboring pages.
  if (!hasOffscreenRuntimeCapability(request.sender)) {
    return reject('Unauthorized voice input offscreen event sender');
  }
  return authorize(
    createBackgroundOwnedRoutePreauthorization({
      entry: routeEntry,
      handle: { kind: 'background-owned-route-policy' },
      message: request.message,
      senderClassification: 'offscreen-document',
    })
  );
}

function authorizeContentActionCapabilityIssuance(
  request: BackgroundOwnedAuthorizationRequest,
  routeEntry: BackgroundOwnedRouteInventoryEntry
): IpcAuthorizationResult {
  const senderDecision = authorizeContentSender(request.sender);
  if (!senderDecision.allowed) {
    return reject('Unauthorized content action capability sender');
  }
  return authorize(
    createBackgroundOwnedRoutePreauthorization({
      entry: routeEntry,
      handle: {
        kind: 'content-action-capability-issuance',
        senderBinding: senderDecision.principal,
      },
      message: request.message,
      senderClassification: 'content-tab-runtime',
    })
  );
}

function authorizeContentRuntimeWakeupRoute(
  request: BackgroundOwnedAuthorizationRequest,
  routeEntry: BackgroundOwnedRouteInventoryEntry
): IpcAuthorizationResult {
  const senderDecision = authorizeContentSender(request.sender);
  if (!senderDecision.allowed) {
    return reject('Unauthorized content runtime wake-up sender');
  }
  if (
    request.message['pinToTab'] === true &&
    !consumeContentPrivilegedActionCapabilityBinding({
      actionType: MessageType.CONTENT_RUNTIME_WAKEUP,
      contentIntent: request.message['contentIntent'],
      resolvedTabId: senderDecision.principal.tabId,
      sender: request.sender,
    })
  ) {
    return reject('Unauthorized pin-to-tab permission request');
  }
  return authorize(
    createBackgroundOwnedRoutePreauthorization({
      entry: routeEntry,
      handle: { kind: 'content-runtime-wakeup', senderBinding: senderDecision.principal },
      message: request.message,
      senderClassification: 'content-tab-runtime',
    })
  );
}

export function authorizeBackgroundOwnedRoute(
  request: BackgroundOwnedAuthorizationRequest
): IpcAuthorizationResult {
  const authorization = authorizeBackgroundOwnedRouteMaybeAsync(request);
  if (isPromise(authorization)) {
    return reject('Async background-owned IPC authorization requires async dispatch');
  }
  return authorization;
}

export function authorizeBackgroundOwnedRouteMaybeAsync(
  request: BackgroundOwnedAuthorizationRequest
): IpcAuthorizationResult | Promise<IpcAuthorizationResult> {
  const routeEntry = getBackgroundOwnedRouteInventoryEntry(request.message.type);
  const dispatcher = backgroundOwnedAuthorizationDispatchers.find((entry) =>
    entry.messageTypes.includes(request.message.type)
  );
  if (!routeEntry || !dispatcher) {
    return reject(`Missing background-owned IPC policy for ${request.message.type}`);
  }
  return dispatcher.authorize(request, routeEntry);
}

function isPromise<TValue>(value: TValue | Promise<TValue>): value is Promise<TValue> {
  return typeof (value as { then?: unknown }).then === 'function';
}

function getBackgroundOwnedAuthorizationHandler(
  handlerId: BackgroundOwnedRouteInventoryEntry['handlerId']
): BackgroundOwnedAuthorizationDispatcher['authorize'] {
  switch (handlerId) {
    case 'aggregate-promotion':
      return authorizeAggregatePromotionRoute;
    case 'ai-secret-unlock':
      return authorizeAiSecretUnlockRoute;
    case 'ai-settings-query':
      return authorizeAiSettingsQueryRoute;
    case 'ai-settings-mutation':
      return authorizeAiSettingsMutationRoute;
    case 'ai-settings-navigation':
      return authorizeAiSettingsNavigationRoute;
    case 'annotation-fork-session':
      return authorizeAnnotationForkSessionRoute;
    case 'content-action-capability-issuance':
      return authorizeContentActionCapabilityIssuance;
    case 'content-runtime-wakeup':
      return authorizeContentRuntimeWakeupRoute;
    case 'frame-annotation-raster':
      return authorizeFrameAnnotationRasterRoute;
    case 'llm-content-processing':
      return authorizeContentLlmRoute;
    case 'llm-scenario-editor-processing':
      return authorizeScenarioEditorLlmRoute;
    case 'llm-session':
      return authorizeLlmSessionRequestRoute;
    case 'local-data-erasure':
      return authorizeLocalDataErasureRoute;
    case 'native-app-runtime':
      return authorizeNativeAppRoute;
    case 'page-access':
      return authorizePageAccessRoute;
    case 'popup-export-archive':
      return authorizePopupExportArchiveRoute;
    case 'popup-tab-route-capability-issuance':
      return authorizePopupTabRouteCapabilityIssuance;
    case 'voice-input-offscreen-event':
      return authorizeVoiceInputOffscreenEvent;
  }
}

function getBackgroundOwnedPolicyEntries(): Array<[string, string]> {
  return backgroundOwnedRouteInventory.flatMap((entry) =>
    entry.messageTypes.map((messageType): [string, string] => [
      messageType,
      entry.policyAuthorityFamily,
    ])
  );
}
