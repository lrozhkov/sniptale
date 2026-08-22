import {
  routeAISecretUnlockMessage,
  routeAiSettingsQueryMessage,
  routeAiSettingsMutationMessage,
  routeLlmMessage,
  routeLlmSessionMessage,
  routeScenarioEditorLlmMessage,
} from '../../../ai/routes';
import { routeAiSettingsNavigationMessage } from '../../../ai/settings/navigation-route';
import { routePageAccessMessage } from '../../../page-access/route';
import { routeNativeAppRuntimeMessage } from '../../native-app/route';
import { routeContentRuntimeWakeupMessage } from '../../page-access/wakeup-route';
import { routePopupExportJobMessage } from '../../../capture/popup-export/job/route';
import { routeLocalDataErasureMessage } from '../../../application/privacy-erasure/route';
import { routeSettingsTransferMessage } from '../../../application/settings-transfer/route';
import { routePopupTabRouteCapabilityRequest } from '../capabilities/popup-tab/route-capabilities';
import * as contentCaps from '../../../routing-contracts/capabilities/content-action/route';
import type { ContentSenderBinding } from '../../../routing-contracts/capabilities/content-action/capability-store';
import {
  getAnnotationForkSessionSenderBinding,
  getContentActionCapabilityIssuanceSenderBinding,
  getContentRuntimeWakeupSenderBinding,
  type BackgroundOwnedRouteContext,
} from '../../../routing-contracts/owned-route-context';
import { backgroundOwnedRouteInventory } from './owned-route-inventory';
import type { BackgroundOwnedRouteHandlerId } from '../../../routing-contracts/owned-route-context';
import type { ActionResult, BackgroundOwnedAction } from './types';
import { routeVoiceInputOffscreenEvent } from '../../../voice-input/route';
import { routeFrameAnnotationRasterMessage } from '../../../frame-annotation-raster/route';
import { routeAnnotationForkSessionMessage } from '../../../annotation-fork-session/route';
import { routeAggregatePromotionMessage } from '../../../application/aggregate-promotion/route';
import {
  cancelPopupExportPagePackage,
  requestPopupExportPagePackage,
} from '../boundary/popup-export-routing';

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

export const backgroundOwnedHandlerBindings = {
  'aggregate-promotion': routeAggregatePromotionAction,
  'ai-secret-unlock': routeAiSecretUnlockAction,
  'ai-settings-mutation': routeAiSettingsMutationAction,
  'ai-settings-navigation': routeAiSettingsNavigationAction,
  'ai-settings-query': routeAiSettingsQueryAction,
  'annotation-fork-session': routeAnnotationForkSessionAction,
  'content-action-capability-issuance': routeContentActionCapabilityIssuance,
  'content-runtime-wakeup': routeContentRuntimeWakeupAction,
  'frame-annotation-raster': routeFrameAnnotationRasterAction,
  'llm-content-processing': routeLlmAction,
  'llm-scenario-editor-processing': routeScenarioEditorLlmAction,
  'llm-session': routeLlmSessionAction,
  'local-data-erasure': routeLocalDataErasureAction,
  'native-app-runtime': routeNativeAppRuntimeAction,
  'page-access': routePageAccessAction,
  'popup-export-job': routePopupExportJobAction,
  'popup-tab-route-capability-issuance': routePopupTabRouteCapabilityAction,
  'settings-transfer': routeSettingsTransferAction,
  'voice-input-offscreen-event': routeVoiceInputOffscreenEventAction,
} satisfies Record<BackgroundOwnedRouteHandlerId, BackgroundOwnedRouteHandler>;

export const backgroundOwnedRouteDispatchers = backgroundOwnedRouteInventory.map((entry) => ({
  handlerId: entry.handlerId,
  messageTypes: entry.messageTypes,
  ownerModule: entry.ownerModule,
  route: backgroundOwnedHandlerBindings[entry.handlerId],
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

function routePopupExportJobAction(action: BackgroundOwnedAction): ActionResult | null {
  return keepOpen(
    routePopupExportJobMessage(action.message, action.context.sendResponse, {
      cancelPagePackage: cancelPopupExportPagePackage,
      requestPagePackage: requestPopupExportPagePackage,
    })
  );
}

function routeAggregatePromotionAction(action: BackgroundOwnedAction): ActionResult | null {
  return keepOpen(routeAggregatePromotionMessage(action.message, action.context.sendResponse));
}

function routeFrameAnnotationRasterAction(action: BackgroundOwnedAction): ActionResult | null {
  return keepOpen(routeFrameAnnotationRasterMessage(action.message, action.context.sendResponse));
}

function routeVoiceInputOffscreenEventAction(action: BackgroundOwnedAction): ActionResult | null {
  return keepOpen(routeVoiceInputOffscreenEvent(action.message, action.context.sendResponse));
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

function routeAiSettingsNavigationAction(
  action: BackgroundOwnedAction,
  routeContext: BackgroundOwnedRouteContext | null
): ActionResult | null {
  return keepOpen(
    routeAiSettingsNavigationMessage(action.message, action.context.sendResponse, routeContext)
  );
}

function routeAnnotationForkSessionAction(
  action: BackgroundOwnedAction,
  routeContext: BackgroundOwnedRouteContext | null
): ActionResult | null {
  return keepOpen(
    routeAnnotationForkSessionMessage({
      message: action.message,
      senderBinding: getAnnotationForkSessionSenderBinding(routeContext, action.message),
      sendResponse: action.context.sendResponse,
    })
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

function routeSettingsTransferAction(action: BackgroundOwnedAction): ActionResult | null {
  return keepOpen(routeSettingsTransferMessage(action.message, action.context.sendResponse));
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
