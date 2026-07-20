import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { BackgroundOwnedRouteContext } from '../../../routing-contracts/owned-route-context';
import type { BackgroundOwnedAction } from './types';

const {
  routeAISecretUnlockMessageMock,
  routeAiSettingsQueryMessageMock,
  routeAiSettingsMutationMessageMock,
  routeContentActivationKeyRequestMock,
  routeContentCapabilityRequestMock,
  routeContentRuntimeWakeupMessageMock,
  routeContentProofRequestMock,
  routeContentRuntimeTokenRequestMock,
  routeLlmMessageMock,
  routeLlmSessionMessageMock,
  routeLocalDataErasureMessageMock,
  routePageAccessMessageMock,
  routePopupExportArchiveMessageMock,
  routePopupTabRouteCapabilityRequestMock,
  routeScenarioEditorLlmMessageMock,
} = vi.hoisted(() => ({
  routeAISecretUnlockMessageMock: vi.fn(),
  routeAiSettingsQueryMessageMock: vi.fn(),
  routeAiSettingsMutationMessageMock: vi.fn(),
  routeContentActivationKeyRequestMock: vi.fn(),
  routeContentCapabilityRequestMock: vi.fn(),
  routeContentRuntimeWakeupMessageMock: vi.fn(),
  routeContentProofRequestMock: vi.fn(),
  routeContentRuntimeTokenRequestMock: vi.fn(),
  routeLlmMessageMock: vi.fn(),
  routeLlmSessionMessageMock: vi.fn(),
  routeLocalDataErasureMessageMock: vi.fn(),
  routePageAccessMessageMock: vi.fn(),
  routePopupExportArchiveMessageMock: vi.fn(),
  routePopupTabRouteCapabilityRequestMock: vi.fn(),
  routeScenarioEditorLlmMessageMock: vi.fn(),
}));

vi.mock('../../../ai/settings/route', () => ({
  routeAiSettingsMutationMessage: routeAiSettingsMutationMessageMock,
}));

vi.mock('../../../ai/settings/query-route', () => ({
  routeAiSettingsQueryMessage: routeAiSettingsQueryMessageMock,
}));

vi.mock('../../../ai/settings/secret-unlock-route', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../ai/settings/secret-unlock-route')>()),
  routeAISecretUnlockMessage: routeAISecretUnlockMessageMock,
}));

vi.mock('../../../ai/llm/router', () => ({
  routeLlmMessage: routeLlmMessageMock,
}));

vi.mock('../../../ai/llm/editor-router', () => ({
  routeScenarioEditorLlmMessage: routeScenarioEditorLlmMessageMock,
}));

vi.mock('../../../ai/llm/session-route', () => ({
  routeLlmSessionMessage: routeLlmSessionMessageMock,
}));

vi.mock('../../page-access/route', () => ({
  routePageAccessMessage: routePageAccessMessageMock,
}));

vi.mock('../../page-access/wakeup-route', () => ({
  routeContentRuntimeWakeupMessage: routeContentRuntimeWakeupMessageMock,
}));

vi.mock('../../../application/privacy-erasure/route', () => ({
  routeLocalDataErasureMessage: routeLocalDataErasureMessageMock,
}));

vi.mock('../../../capture/popup-export/archive-route', () => ({
  routePopupExportArchiveMessage: routePopupExportArchiveMessageMock,
}));

vi.mock('../capabilities/popup-tab/route-capabilities', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../capabilities/popup-tab/route-capabilities')>()),
  routePopupTabRouteCapabilityRequest: routePopupTabRouteCapabilityRequestMock,
}));

vi.mock('../../../routing-contracts/capabilities/content-action/route', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../routing-contracts/capabilities/content-action/route')
  >()),
  routeContentPrivilegedActionActivationKeyRequest: routeContentActivationKeyRequestMock,
  routeContentPrivilegedActionCapabilityRequest: routeContentCapabilityRequestMock,
  routeContentPrivilegedActionProofRequest: routeContentProofRequestMock,
  routeContentPrivilegedActionRuntimeTokenRequest: routeContentRuntimeTokenRequestMock,
}));

import { dispatchBackgroundOwnedRoute } from './owned-route-handlers';

const sender = { tab: { id: 7 } as chrome.tabs.Tab };
const sendResponse = vi.fn();
const routeContext = {
  preauthorization: { kind: 'ai-secret-unlock-route' },
} as BackgroundOwnedRouteContext;
const contentRuntimeWakeupSenderBinding = {
  documentId: 'document-7',
  frameId: 0,
  senderUrl: 'https://example.test/path',
  tabId: 7,
};
const contentRuntimeWakeupRouteContext = {
  authorityFamily: 'content-runtime-wakeup',
  freshnessReplay: 'sync-policy-approved',
  messageBinding: {
    type: MessageType.CONTENT_RUNTIME_WAKEUP,
  },
  ownerRoute: {
    handlerId: 'content-runtime-wakeup',
    messageTypes: [MessageType.CONTENT_RUNTIME_WAKEUP],
    ownerModule: 'apps/extension/src/background/runtime/page-access/wakeup-route.ts',
    policyStateIds: ['page-access-tab-activation'],
    routeAuthorityFamily: 'content-runtime-wakeup',
  },
  preauthorization: {
    kind: 'content-runtime-wakeup',
    senderBinding: contentRuntimeWakeupSenderBinding,
  },
  senderClassification: 'content-runtime-wakeup-content-script',
} as BackgroundOwnedRouteContext;

beforeEach(() => {
  vi.resetAllMocks();
});

it('returns unhandled for unknown background-owned message types', () => {
  expect(dispatchBackgroundOwnedRoute(action('UNKNOWN_ROUTE' as MessageType), null)).toEqual({
    handled: false,
  });
});

it('routes single-message background-owned handlers through their owner adapters', () => {
  primeSingleMessageRouteMocks();
  expectSingleMessageRoutesHandled();
  expectContextAwareRouteAdaptersCalled();
});

function primeSingleMessageRouteMocks() {
  routeLlmSessionMessageMock.mockReturnValue(true);
  routeAiSettingsQueryMessageMock.mockReturnValue(true);
  routeAiSettingsMutationMessageMock.mockReturnValue(true);
  routeAISecretUnlockMessageMock.mockReturnValue(true);
  routePageAccessMessageMock.mockReturnValue(true);
  routeContentRuntimeWakeupMessageMock.mockReturnValue(true);
  routeLocalDataErasureMessageMock.mockReturnValue(true);
  routeLlmMessageMock.mockReturnValue(true);
  routeScenarioEditorLlmMessageMock.mockReturnValue(true);
  routePopupTabRouteCapabilityRequestMock.mockReturnValue(true);
}

function expectSingleMessageRoutesHandled() {
  const routes: Array<[MessageType, BackgroundOwnedRouteContext | null]> = [
    [MessageType.REQUEST_LLM_SESSION, null],
    [MessageType.AI_SETTINGS_QUERY, routeContext],
    [MessageType.AI_SETTINGS_MUTATION, null],
    [MessageType.AI_SECRET_UNLOCK, routeContext],
    [MessageType.PAGE_ACCESS, null],
    [MessageType.CONTENT_RUNTIME_WAKEUP, contentRuntimeWakeupRouteContext],
    [MessageType.ERASE_LOCAL_EXTENSION_DATA, null],
    [MessageType.PROCESS_WITH_LLM, null],
    [MessageType.PROCESS_SCENARIO_EDITOR_WITH_LLM, null],
    [MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY, null],
  ];

  routes.forEach(([type, context]) => {
    expect(dispatchBackgroundOwnedRoute(action(type), context)).toEqual({
      handled: true,
      keepChannelOpen: true,
    });
  });
}

function expectContextAwareRouteAdaptersCalled() {
  expect(routeAISecretUnlockMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({ type: MessageType.AI_SECRET_UNLOCK }),
    sender,
    sendResponse,
    routeContext
  );
  expect(routeAiSettingsQueryMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({ type: MessageType.AI_SETTINGS_QUERY }),
    sender,
    sendResponse,
    routeContext
  );
  expect(routeContentRuntimeWakeupMessageMock).toHaveBeenCalledWith({
    message: expect.objectContaining({ type: MessageType.CONTENT_RUNTIME_WAKEUP }),
    runtimeState: expect.any(Object),
    sendResponse,
    senderBinding: contentRuntimeWakeupSenderBinding,
  });
}

it('routes popup archive message families through one owner adapter', () => {
  routePopupExportArchiveMessageMock.mockReturnValue(true);

  expect(
    dispatchBackgroundOwnedRoute(action(MessageType.STAGE_POPUP_EXPORT_ARCHIVE_CHUNK), null)
  ).toEqual({ handled: true, keepChannelOpen: true });
  expect(dispatchBackgroundOwnedRoute(action(MessageType.EXPORT_POPUP_SAVE_ARCHIVE), null)).toEqual(
    {
      handled: true,
      keepChannelOpen: true,
    }
  );
  expect(
    dispatchBackgroundOwnedRoute(action(MessageType.RELEASE_POPUP_EXPORT_ARCHIVE), null)
  ).toEqual({ handled: true, keepChannelOpen: true });
});

it('routes content capability issuance to the first matching content adapter', () => {
  routeContentActivationKeyRequestMock.mockReturnValueOnce(true);
  expect(
    dispatchBackgroundOwnedRoute(
      action(MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY),
      null
    )
  ).toEqual({ handled: true, keepChannelOpen: false });

  routeContentRuntimeTokenRequestMock.mockReturnValueOnce(true);
  expect(
    dispatchBackgroundOwnedRoute(
      action(MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN),
      null
    )
  ).toEqual({ handled: true, keepChannelOpen: false });

  routeContentProofRequestMock.mockReturnValueOnce(true);
  expect(
    dispatchBackgroundOwnedRoute(action(MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF), null)
  ).toEqual({ handled: true, keepChannelOpen: false });

  routeContentCapabilityRequestMock.mockReturnValueOnce(true);
  expect(
    dispatchBackgroundOwnedRoute(
      action(MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY),
      null
    )
  ).toEqual({ handled: true, keepChannelOpen: false });
});

it('returns unhandled when a matched owner adapter declines the message', () => {
  expect(dispatchBackgroundOwnedRoute(action(MessageType.AI_SETTINGS_MUTATION), null)).toEqual({
    handled: false,
  });
});

function action(type: MessageType): BackgroundOwnedAction {
  return {
    actionKind: 'background-owned',
    context: {
      documentId: null,
      frameId: null,
      logger: { warn: vi.fn() },
      origin: null,
      runtimeState: {} as BackgroundOwnedAction['context']['runtimeState'],
      sendResponse,
      sender,
      senderUrl: null,
      tabId: 7,
    },
    message: { type } as BackgroundOwnedAction['message'],
    routeName: `background-owned:${type}`,
  };
}
