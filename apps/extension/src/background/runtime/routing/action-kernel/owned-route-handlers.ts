import {
  routeAISecretUnlockMessage,
  routeAiSettingsQueryMessage,
  routeAiSettingsMutationMessage,
  routeLlmMessage,
  routeLlmSessionMessage,
  routeScenarioEditorLlmMessage,
} from '../../../ai/routes';
import { routePageAccessMessage } from '../../page-access/route';
import { routeNativeAppRuntimeMessage } from '../../native-app/route';
import { routeContentRuntimeWakeupMessage } from '../../page-access/wakeup-route';
import { routePopupExportArchiveMessage } from '../../../capture/routes';
import { routeLocalDataErasureMessage } from '../../../application/privacy-erasure/route';
import { routePopupTabRouteCapabilityRequest } from '../capabilities/popup-tab/route-capabilities';
import * as contentCaps from '../../../routing-contracts/capabilities/content-action/route';
import type { ContentSenderBinding } from '../../../routing-contracts/capabilities/content-action/capability-store';
import {
  getContentActionCapabilityIssuanceSenderBinding,
  getContentRuntimeWakeupSenderBinding,
  type BackgroundOwnedRouteContext,
} from '../../../routing-contracts/owned-route-context';
import { backgroundOwnedRouteInventory } from './owned-route-inventory';
import type { BackgroundOwnedRouteHandlerId } from '../../../routing-contracts/owned-route-context';
import type { ActionResult, BackgroundOwnedAction } from './types';

type BackgroundOwnedRouteHandler = (
  action: BackgroundOwnedAction,
  routeContext: BackgroundOwnedRouteContext | null
) => ActionResult | null;

type BackgroundOwnedRouteDispatcher = {
  readonly handlerId: BackgroundOwnedRouteHandlerId;
  readonly messageTypes: readonly string[];
  readonly ownerModule: string;
  readonly route: BackgroundOwnedRouteHandler;
};

const keepOpen = (handled: boolean): ActionResult | null =>
  handled ? { handled: true, keepChannelOpen: true } : null;

export const backgroundOwnedRouteDispatchers = backgroundOwnedRouteInventory.map((entry) => ({
  handlerId: entry.handlerId,
  messageTypes: entry.messageTypes,
  ownerModule: entry.ownerModule,
  route: getBackgroundOwnedRouteHandler(entry.handlerId),
})) as readonly BackgroundOwnedRouteDispatcher[];

export function dispatchBackgroundOwnedRoute(
  action: BackgroundOwnedAction,
  routeContext: BackgroundOwnedRouteContext | null
): ActionResult {
  const dispatcher = backgroundOwnedRouteDispatchers.find((entry) =>
    entry.messageTypes.includes(action.message.type)
  );
  return dispatcher?.route(action, routeContext) ?? { handled: false };
}

function getBackgroundOwnedRouteHandler(
  handlerId: BackgroundOwnedRouteHandlerId
): BackgroundOwnedRouteHandler {
  switch (handlerId) {
    case 'ai-secret-unlock':
      return routeAiSecretUnlockAction;
    case 'ai-settings-query':
      return routeAiSettingsQueryAction;
    case 'ai-settings-mutation':
      return routeAiSettingsMutationAction;
    case 'content-action-capability-issuance':
      return routeContentActionCapabilityIssuance;
    case 'content-runtime-wakeup':
      return routeContentRuntimeWakeupAction;
    case 'llm-content-processing':
      return routeLlmAction;
    case 'llm-scenario-editor-processing':
      return routeScenarioEditorLlmAction;
    case 'llm-session':
      return routeLlmSessionAction;
    case 'local-data-erasure':
      return routeLocalDataErasureAction;
    case 'native-app-runtime':
      return routeNativeAppRuntimeAction;
    case 'page-access':
      return routePageAccessAction;
    case 'popup-export-archive':
      return routePopupExportArchiveAction;
    case 'popup-tab-route-capability-issuance':
      return routePopupTabRouteCapabilityAction;
  }
}

function routeNativeAppRuntimeAction(action: BackgroundOwnedAction): ActionResult | null {
  return keepOpen(
    routeNativeAppRuntimeMessage(action.message, action.context.sender, action.context.sendResponse)
  );
}

function routeLlmSessionAction(action: BackgroundOwnedAction): ActionResult | null {
  return keepOpen(
    routeLlmSessionMessage(action.message, action.context.sender, action.context.sendResponse)
  );
}

function routeAiSettingsQueryAction(
  action: BackgroundOwnedAction,
  routeContext: BackgroundOwnedRouteContext | null
): ActionResult | null {
  return keepOpen(
    routeAiSettingsQueryMessage(
      action.message,
      action.context.sender,
      action.context.sendResponse,
      routeContext
    )
  );
}

function routeAiSettingsMutationAction(action: BackgroundOwnedAction): ActionResult | null {
  return keepOpen(
    routeAiSettingsMutationMessage(
      action.message,
      action.context.sender,
      action.context.sendResponse
    )
  );
}

function routeAiSecretUnlockAction(
  action: BackgroundOwnedAction,
  routeContext: BackgroundOwnedRouteContext | null
): ActionResult | null {
  return keepOpen(
    routeAISecretUnlockMessage(
      action.message,
      action.context.sender,
      action.context.sendResponse,
      routeContext
    )
  );
}

function routePageAccessAction(action: BackgroundOwnedAction): ActionResult | null {
  return keepOpen(routePageAccessMessage(action.message, action.context.sendResponse));
}

function routeContentRuntimeWakeupAction(
  action: BackgroundOwnedAction,
  routeContext: BackgroundOwnedRouteContext | null
): ActionResult | null {
  return keepOpen(
    routeContentRuntimeWakeupMessage({
      message: action.message,
      runtimeState: action.context.runtimeState,
      senderBinding: getContentRuntimeWakeupSenderBinding(routeContext, action.message),
      sendResponse: action.context.sendResponse,
    })
  );
}

function routeLocalDataErasureAction(action: BackgroundOwnedAction): ActionResult | null {
  return keepOpen(
    routeLocalDataErasureMessage(
      action.message,
      action.context.sendResponse,
      action.context.runtimeState
    )
  );
}

function routePopupExportArchiveAction(action: BackgroundOwnedAction): ActionResult | null {
  return keepOpen(routePopupExportArchiveMessage(action.message, action.context.sendResponse));
}

function routeLlmAction(action: BackgroundOwnedAction): ActionResult | null {
  return keepOpen(
    routeLlmMessage(action.message, action.context.sendResponse, action.context.sender)
  );
}

function routeScenarioEditorLlmAction(action: BackgroundOwnedAction): ActionResult | null {
  return keepOpen(
    routeScenarioEditorLlmMessage(
      action.message,
      action.context.sendResponse,
      action.context.sender
    )
  );
}

function routePopupTabRouteCapabilityAction(action: BackgroundOwnedAction): ActionResult | null {
  return keepOpen(
    routePopupTabRouteCapabilityRequest(
      action.message,
      action.context.sender,
      action.context.sendResponse
    )
  );
}

function routeContentActionCapabilityIssuance(
  action: BackgroundOwnedAction,
  routeContext: BackgroundOwnedRouteContext | null
): ActionResult | null {
  const { message } = action;
  const { sendResponse, sender } = action.context;
  const preauthorizedSenderBinding = getContentActionCapabilityIssuanceSenderBinding(
    routeContext,
    message
  );

  return routeContentActionCapabilityIssuanceRequest({
    message,
    preauthorizedSenderBinding,
    sendResponse,
    sender,
  });
}

function routeContentActionCapabilityIssuanceRequest(args: {
  message: BackgroundOwnedAction['message'];
  preauthorizedSenderBinding: ContentSenderBinding | null;
  sendResponse: BackgroundOwnedAction['context']['sendResponse'];
  sender: chrome.runtime.MessageSender;
}): ActionResult | null {
  const handled =
    contentCaps.routeContentPrivilegedActionActivationKeyRequest(
      args.message,
      args.sender,
      args.sendResponse,
      args.preauthorizedSenderBinding
    ) ||
    contentCaps.routeContentPrivilegedActionRuntimeTokenRequest(
      args.message,
      args.sender,
      args.sendResponse,
      args.preauthorizedSenderBinding
    ) ||
    contentCaps.routeContentPrivilegedActionProofRequest(
      args.message,
      args.sender,
      args.sendResponse,
      args.preauthorizedSenderBinding
    ) ||
    contentCaps.routeContentPrivilegedActionCapabilityRequest(
      args.message,
      args.sender,
      args.sendResponse,
      args.preauthorizedSenderBinding
    );

  return handled ? { handled: true, keepChannelOpen: false } : null;
}
