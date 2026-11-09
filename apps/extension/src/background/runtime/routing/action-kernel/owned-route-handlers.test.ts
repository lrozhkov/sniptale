import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createBackgroundRuntimeState } from '../../../application/runtime-state';
import { createSyncCredentialRoute } from '../../../sync-connection/credential-route';
import type {
  SyncCredentialLease,
  SyncCredentialRequest,
  SyncCredentialResponse,
} from '../../../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import { createActionContext } from './context';
import type { BackgroundOwnedRouteContext } from '../../../routing-contracts/owned-route-context';
import type { BackgroundOwnedAction } from './types';

const {
  routeAISecretUnlockMessageMock,
  routeAiSettingsQueryMessageMock,
  routeAiSettingsMutationMessageMock,
  routeAiSettingsNavigationMessageMock,
  routeAnnotationForkSessionMessageMock,
  routeContentActivationKeyRequestMock,
  routeContentCapabilityRequestMock,
  routeContentRuntimeWakeupMessageMock,
  routeContentProofRequestMock,
  routeContentRuntimeTokenRequestMock,
  routeLlmMessageMock,
  routeLlmSessionMessageMock,
  routeLocalDataErasureMessageMock,
  routePageAccessMessageMock,
  routePopupTabRouteCapabilityRequestMock,
  routeScenarioEditorLlmMessageMock,
} = vi.hoisted(() => ({
  routeAISecretUnlockMessageMock: vi.fn(),
  routeAiSettingsQueryMessageMock: vi.fn(),
  routeAiSettingsMutationMessageMock: vi.fn(),
  routeAiSettingsNavigationMessageMock: vi.fn(),
  routeAnnotationForkSessionMessageMock: vi.fn(),
  routeContentActivationKeyRequestMock: vi.fn(),
  routeContentCapabilityRequestMock: vi.fn(),
  routeContentRuntimeWakeupMessageMock: vi.fn(),
  routeContentProofRequestMock: vi.fn(),
  routeContentRuntimeTokenRequestMock: vi.fn(),
  routeLlmMessageMock: vi.fn(),
  routeLlmSessionMessageMock: vi.fn(),
  routeLocalDataErasureMessageMock: vi.fn(),
  routePageAccessMessageMock: vi.fn(),
  routePopupTabRouteCapabilityRequestMock: vi.fn(),
  routeScenarioEditorLlmMessageMock: vi.fn(),
}));

vi.mock('../../../ai/settings/route', () => ({
  routeAiSettingsMutationMessage: routeAiSettingsMutationMessageMock,
}));

vi.mock('../../../ai/settings/query-route', () => ({
  routeAiSettingsQueryMessage: routeAiSettingsQueryMessageMock,
}));

vi.mock('../../../ai/settings/navigation-route', () => ({
  routeAiSettingsNavigationMessage: routeAiSettingsNavigationMessageMock,
}));

vi.mock('../../../annotation-fork-session/route', () => ({
  bindAnnotationForkSessionDocument: vi.fn(),
  clearAnnotationForkSessionForTab: vi.fn(),
  routeAnnotationForkSessionMessage: routeAnnotationForkSessionMessageMock,
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

vi.mock('../../../page-access/route', () => ({
  routePageAccessMessage: routePageAccessMessageMock,
}));

vi.mock('../../page-access/wakeup-route', () => ({
  routeContentRuntimeWakeupMessage: routeContentRuntimeWakeupMessageMock,
}));

vi.mock('../../../application/privacy-erasure/route', () => ({
  routeLocalDataErasureMessage: routeLocalDataErasureMessageMock,
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
    policyStateIds: ['content-action-capabilities', 'page-access-tab-activation'],
    routeAuthorityFamily: 'content-runtime-wakeup',
  },
  preauthorization: {
    kind: 'content-runtime-wakeup',
    senderBinding: contentRuntimeWakeupSenderBinding,
  },
  senderClassification: 'content-runtime-wakeup-content-script',
} as BackgroundOwnedRouteContext;
const annotationForkRouteContext = {
  authorityFamily: 'annotation-fork-session',
  freshnessReplay: 'sync-policy-approved',
  messageBinding: { type: MessageType.ANNOTATION_FORK_SESSION },
  ownerRoute: {
    handlerId: 'annotation-fork-session',
    messageTypes: [MessageType.ANNOTATION_FORK_SESSION],
    ownerModule: 'apps/extension/src/background/annotation-fork-session/route.ts',
    policyStateIds: ['annotation-fork-sessions'],
    routeAuthorityFamily: 'background-owned-ipc',
  },
  preauthorization: {
    kind: 'annotation-fork-session',
    senderBinding: contentRuntimeWakeupSenderBinding,
  },
  senderClassification: 'content-tab-runtime',
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
  routeAiSettingsNavigationMessageMock.mockReturnValue(true);
  routeAnnotationForkSessionMessageMock.mockReturnValue(true);
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
    [MessageType.AI_SETTINGS_NAVIGATION, routeContext],
    [MessageType.ANNOTATION_FORK_SESSION, annotationForkRouteContext],
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
    routeContext,
    undefined,
    undefined
  );
  expect(routeAiSettingsQueryMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({ type: MessageType.AI_SETTINGS_QUERY }),
    sender,
    sendResponse,
    routeContext,
    undefined
  );
  expect(routeAiSettingsNavigationMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({ type: MessageType.AI_SETTINGS_NAVIGATION }),
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

it('dispatches the sync query to its exact-sender owner instead of granting page authority', () => {
  const input = action(MessageType.SYNC_CONNECTION_ORIGIN_PERMISSION);
  const response = dispatchBackgroundOwnedRoute(input, null);
  expect(response).toEqual({ handled: true, keepChannelOpen: true });
  expect(sendResponse).toHaveBeenCalledExactlyOnceWith({
    success: false,
    error: 'Sync origin permission query refused',
  });
});

it('dispatches product commands through their owner and keeps its response channel open', () => {
  const input = action(MessageType.SYNC_PRODUCT_COMMAND);
  const message = {
    type: MessageType.SYNC_PRODUCT_COMMAND,
    requestId: '11111111-1111-4111-8111-111111111111',
    command: { kind: 'status' },
  };
  input.message = message;
  const result = dispatchBackgroundOwnedRoute(input, null);
  expect(result).toEqual({ handled: true, keepChannelOpen: true });
  expect(sendResponse).toHaveBeenCalledExactlyOnceWith({
    success: false,
    error: 'Sync product command refused',
  });
});

it('leaves malformed product ingress unhandled without invoking a response', () => {
  expect(dispatchBackgroundOwnedRoute(action(MessageType.SYNC_PRODUCT_COMMAND), null)).toEqual({
    handled: false,
  });
  expect(sendResponse).not.toHaveBeenCalled();
});

it('keeps a delayed credential refusal private from the origin permission owner', async () => {
  const credentialLease: SyncCredentialLease = {
    leaseId: '00000000-0000-4000-8000-000000000001',
    workerEpoch: '00000000-0000-4000-8000-000000000002',
    protectionEpoch: 3,
    offscreenStartupId: '00000000-0000-4000-8000-000000000003',
    executorId: '00000000-0000-4000-8000-000000000004',
    credentialId: '00000000-0000-4000-8000-000000000005',
    authorization: { incarnation: '00000000-0000-4000-8000-000000000006', revision: 1 },
  };
  let finish!: (value: SyncCredentialResponse) => void;
  const pending = new Promise<SyncCredentialResponse>((resolve) => {
    finish = resolve;
  });
  type Resolver = Parameters<
    typeof createSyncCredentialRoute
  >[0]['leases']['resolveAuthentication'];
  const resolveAuthentication = vi.fn<Resolver>(async (_lease, publish) => {
    const response = await pending;
    publish?.(response);
    return response;
  });
  const runtimeState = createBackgroundRuntimeState();
  runtimeState.syncCredentialRoute = createSyncCredentialRoute({
    leases: { resolveAuthentication },
    hasTrustedSender: (value) => value.url === 'chrome-extension://owned/offscreen.html',
  });
  const permission = vi.fn<NonNullable<typeof runtimeState.syncOriginPermissionRoute>>();
  runtimeState.syncOriginPermissionRoute = permission;
  const message: SyncCredentialRequest = {
    type: MessageType.SYNC_CONNECTION_CREDENTIAL,
    requestId: '00000000-0000-4000-8000-000000000007',
    credentialLease,
  };
  const input: BackgroundOwnedAction = {
    actionKind: 'background-owned',
    context: createActionContext({
      runtimeState,
      logger: { warn: vi.fn() },
      sender: { id: 'owned', url: 'chrome-extension://owned/offscreen.html', frameId: 0 },
      sendResponse,
    }),
    message,
    routeName: `background-owned:${MessageType.SYNC_CONNECTION_CREDENTIAL}`,
  };
  expect(dispatchBackgroundOwnedRoute(input, null)).toEqual({
    handled: true,
    keepChannelOpen: true,
  });
  expect(resolveAuthentication).toHaveBeenCalledExactlyOnceWith(credentialLease, sendResponse);
  expect(permission).not.toHaveBeenCalled();
  expect(sendResponse).not.toHaveBeenCalled();
  const refusal: SyncCredentialResponse = { success: false, error: 'secrets-locked' };
  finish(refusal);
  await pending;
  expect(sendResponse).toHaveBeenCalledExactlyOnceWith(refusal);
  expect(permission).not.toHaveBeenCalled();
});
