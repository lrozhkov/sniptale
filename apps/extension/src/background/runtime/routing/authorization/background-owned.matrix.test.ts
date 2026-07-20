import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { AiSettingsMutationMessage } from '../../../../contracts/messaging/ai-settings-runtime';
import type { BackgroundOwnedAuthorizationRequest } from './background-owned.types';

const authMocks = vi.hoisted(() => ({
  authorizeAISecretUnlockSender: vi.fn(),
  authorizeContentLlmRoute: vi.fn(),
  authorizeLlmSessionRequestRoute: vi.fn(),
  authorizeScenarioEditorLlmRoute: vi.fn(),
  isOwnedSettingsPage: vi.fn(),
  isPopupTabRouteSenderUrl: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
  },
}));
vi.mock('../../../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/navigation/extension-pages')>()),
  isOwnedSettingsPage: authMocks.isOwnedSettingsPage,
}));
vi.mock('../../../ai/settings/secret-unlock-route', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../ai/settings/secret-unlock-route')>()),
  authorizeAISecretUnlockSender: authMocks.authorizeAISecretUnlockSender,
}));
vi.mock('../../../ai/llm/authorization/egress', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../ai/llm/authorization/egress')>()),
  authorizeContentLlmRoute: authMocks.authorizeContentLlmRoute,
  authorizeLlmSessionRequestRoute: authMocks.authorizeLlmSessionRequestRoute,
  authorizeScenarioEditorLlmRoute: authMocks.authorizeScenarioEditorLlmRoute,
}));
vi.mock('../capabilities/popup-tab/route-capabilities', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../capabilities/popup-tab/route-capabilities')>()),
  isPopupTabRouteSenderUrl: authMocks.isPopupTabRouteSenderUrl,
}));

import { authorizeBackgroundOwnedRoute } from './background-owned';

function request(
  type: MessageType,
  senderUrl = 'chrome-extension://test/apps/extension/src/popup/index.html'
): BackgroundOwnedAuthorizationRequest {
  return {
    kind: 'background-owned',
    message: { type },
    sender: { url: senderUrl },
  };
}

function aiSettingsMutationRequest(
  message: AiSettingsMutationMessage,
  senderUrl?: string
): BackgroundOwnedAuthorizationRequest {
  return {
    kind: 'background-owned',
    message,
    sender: senderUrl === undefined ? {} : { url: senderUrl },
  };
}

function createProviderMutation(): Extract<
  AiSettingsMutationMessage,
  { operation: 'add-provider' | 'update-provider' }
>['provider'] {
  return {
    apiKey: 'secret',
    baseUrl: 'https://provider.example.test/v1',
    connectionType: 'openai-compatible',
    createdAt: 1,
    id: 'provider-1',
    name: 'Provider',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.authorizeAISecretUnlockSender.mockReturnValue(null);
  authMocks.authorizeContentLlmRoute.mockReturnValue({ authorized: true });
  authMocks.authorizeLlmSessionRequestRoute.mockReturnValue({ authorized: true });
  authMocks.authorizeScenarioEditorLlmRoute.mockReturnValue({ authorized: true });
  authMocks.isOwnedSettingsPage.mockReturnValue(true);
  authMocks.isPopupTabRouteSenderUrl.mockReturnValue(true);
});

it('authorizes supported background-owned owner routes', () => {
  expect(
    authorizeBackgroundOwnedRoute(
      request(
        MessageType.AI_SETTINGS_MUTATION,
        'chrome-extension://test/apps/extension/src/settings/index.html'
      )
    )
  ).toEqual({ authorized: true });
  expect(authorizeBackgroundOwnedRoute(request(MessageType.AI_SECRET_UNLOCK))).toEqual(
    expect.objectContaining({ authorized: true })
  );
  expect(authorizeBackgroundOwnedRoute(request(MessageType.PAGE_ACCESS))).toEqual({
    authorized: true,
  });
  expect(authorizeBackgroundOwnedRoute(request(MessageType.ERASE_LOCAL_EXTENSION_DATA))).toEqual({
    authorized: true,
  });
  expect(
    authorizeBackgroundOwnedRoute(request(MessageType.STAGE_POPUP_EXPORT_ARCHIVE_CHUNK))
  ).toEqual({
    authorized: true,
  });
  expect(authorizeBackgroundOwnedRoute(request(MessageType.EXPORT_POPUP_SAVE_ARCHIVE))).toEqual({
    authorized: true,
  });
  expect(authorizeBackgroundOwnedRoute(request(MessageType.RELEASE_POPUP_EXPORT_ARCHIVE))).toEqual({
    authorized: true,
  });
  expect(
    authorizeBackgroundOwnedRoute(request(MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY))
  ).toEqual({ authorized: true });
});

it('returns explicit route context for AI secret unlock dispatch', () => {
  expect(authorizeBackgroundOwnedRoute(request(MessageType.AI_SECRET_UNLOCK))).toEqual({
    authorized: true,
    preauthorization: {
      kind: 'background-owned-route',
      routeContext: expect.objectContaining({
        authorityFamily: 'ai-secret-unlock-authority',
        freshnessReplay: 'sync-policy-approved',
        ownerRoute: expect.objectContaining({
          handlerId: 'ai-secret-unlock',
          messageTypes: [MessageType.AI_SECRET_UNLOCK],
          ownerModule: 'apps/extension/src/background/ai/settings/secret-unlock-route.ts',
          routeAuthorityFamily: 'background-owned-ipc',
        }),
        preauthorization: { kind: 'ai-secret-unlock-route' },
        senderClassification: 'popup-page',
      }),
    },
  });
});

it('keeps ordinary settings page authority for AI settings mutations', () => {
  expect(
    authorizeBackgroundOwnedRoute(
      aiSettingsMutationRequest(
        {
          operation: 'add-provider',
          provider: createProviderMutation(),
          type: MessageType.AI_SETTINGS_MUTATION,
        },
        'chrome-extension://test/apps/extension/src/settings/index.html'
      )
    )
  ).toEqual({ authorized: true });

  expect(
    authorizeBackgroundOwnedRoute(
      aiSettingsMutationRequest(
        {
          operation: 'save-global-prompt',
          prompt: 'prompt',
          type: MessageType.AI_SETTINGS_MUTATION,
        },
        'chrome-extension://test/apps/extension/src/settings/index.html?section=ai'
      )
    )
  ).toEqual({ authorized: true });
});

it('rejects unlock-mode settings pages for broad AI settings mutations', () => {
  const unlockUrl =
    'chrome-extension://test/apps/extension/src/settings/index.html?aiUnlock=1&requestId=req-1';
  const mutations: AiSettingsMutationMessage[] = [
    {
      operation: 'add-provider',
      provider: createProviderMutation(),
      type: MessageType.AI_SETTINGS_MUTATION,
    },
    {
      operation: 'update-provider',
      provider: createProviderMutation(),
      type: MessageType.AI_SETTINGS_MUTATION,
    },
    {
      modelId: 'model-1',
      operation: 'delete-model',
      type: MessageType.AI_SETTINGS_MUTATION,
    },
    {
      operation: 'save-global-prompt',
      prompt: 'prompt',
      type: MessageType.AI_SETTINGS_MUTATION,
    },
    {
      operation: 'enable-secret-passphrase-protection',
      passphrase: 'passphrase',
      type: MessageType.AI_SETTINGS_MUTATION,
    },
  ];

  expect(
    mutations.map((message) =>
      authorizeBackgroundOwnedRoute(aiSettingsMutationRequest(message, unlockUrl))
    )
  ).toEqual(
    mutations.map(() => ({
      authorized: false,
      reason: 'Unauthorized AI settings mutation sender: unlock mode',
    }))
  );
});

it('rejects malformed unlock-mode settings pages for AI settings mutations', () => {
  expect(
    authorizeBackgroundOwnedRoute(
      aiSettingsMutationRequest(
        {
          operation: 'reset-secret-passphrase-protection',
          type: MessageType.AI_SETTINGS_MUTATION,
        },
        'chrome-extension://test/apps/extension/src/settings/index.html?aiUnlock=1'
      )
    )
  ).toEqual({
    authorized: false,
    reason: 'Unauthorized AI settings mutation sender: unlock mode',
  });
});

it('rejects missing, malformed, and non-settings senders for AI settings mutations', () => {
  const message: AiSettingsMutationMessage = {
    operation: 'read-secret-protection-status',
    type: MessageType.AI_SETTINGS_MUTATION,
  };
  const senderUrls = [
    undefined,
    'not a url',
    'https://example.test/apps/extension/src/settings/index.html',
    'chrome-extension://test/apps/extension/src/settings/other.html',
  ];

  expect(
    senderUrls.map((senderUrl) =>
      authorizeBackgroundOwnedRoute(aiSettingsMutationRequest(message, senderUrl))
    )
  ).toEqual(
    senderUrls.map(() => ({
      authorized: false,
      reason: 'Unauthorized AI settings mutation sender',
    }))
  );
});

it('delegates LLM-owned background policies to egress authorizers', () => {
  expect(authorizeBackgroundOwnedRoute(request(MessageType.REQUEST_LLM_SESSION))).toEqual({
    authorized: true,
  });
  expect(authorizeBackgroundOwnedRoute(request(MessageType.PROCESS_WITH_LLM))).toEqual({
    authorized: true,
  });
  expect(
    authorizeBackgroundOwnedRoute(request(MessageType.PROCESS_SCENARIO_EDITOR_WITH_LLM))
  ).toEqual({ authorized: true });
  expect(authMocks.authorizeLlmSessionRequestRoute).toHaveBeenCalledTimes(1);
  expect(authMocks.authorizeContentLlmRoute).toHaveBeenCalledTimes(1);
  expect(authMocks.authorizeScenarioEditorLlmRoute).toHaveBeenCalledTimes(1);
});

it('rejects unsupported or unauthorized background-owned routes', () => {
  authMocks.authorizeAISecretUnlockSender.mockReturnValueOnce('unlock denied');
  expect(authorizeBackgroundOwnedRoute(request(MessageType.AI_SECRET_UNLOCK))).toEqual({
    authorized: false,
    reason: 'unlock denied',
  });

  authMocks.isOwnedSettingsPage.mockReturnValueOnce(false);
  expect(authorizeBackgroundOwnedRoute(request(MessageType.ERASE_LOCAL_EXTENSION_DATA))).toEqual({
    authorized: false,
    reason: 'Unauthorized local data erasure sender',
  });

  authMocks.isPopupTabRouteSenderUrl.mockReturnValueOnce(false);
  expect(
    authorizeBackgroundOwnedRoute(request(MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY))
  ).toEqual({
    authorized: false,
    reason: 'Unauthorized tab route capability sender',
  });

  expect(authorizeBackgroundOwnedRoute(request('UNKNOWN_ROUTE' as MessageType))).toEqual({
    authorized: false,
    reason: 'Missing background-owned IPC policy for UNKNOWN_ROUTE',
  });
});
