import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { AiSettingsMutationMessage } from '../../../../contracts/messaging/ai-settings-runtime';
import { authorizeBackgroundOwnedRoute } from './background-owned';
import type { BackgroundOwnedAuthorizationRequest } from './background-owned.types';
import {
  getBackgroundOwnedRouteContext,
  getContentActionCapabilityIssuanceSenderBinding,
} from '../../../routing-contracts/owned-route-context';

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

function backgroundRequest(
  type: MessageType,
  sender: chrome.runtime.MessageSender = {
    url: 'chrome-extension://test/apps/extension/src/popup/index.html',
  }
): BackgroundOwnedAuthorizationRequest {
  return {
    kind: 'background-owned',
    message: { type },
    sender,
  };
}

function aiSettingsMutationRequest(
  sender: chrome.runtime.MessageSender
): BackgroundOwnedAuthorizationRequest {
  return {
    kind: 'background-owned',
    message: {
      operation: 'read-secret-protection-status',
      type: MessageType.AI_SETTINGS_MUTATION,
    } satisfies AiSettingsMutationMessage,
    sender,
  };
}

function contentActionRequest(
  type:
    | typeof MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY
    | typeof MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN
    | typeof MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF
    | typeof MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
  sender: chrome.runtime.MessageSender = {
    documentId: 'content-document-1',
    frameId: 0,
    tab: { id: 7 } as chrome.tabs.Tab,
    url: 'https://example.test/page',
  }
): BackgroundOwnedAuthorizationRequest {
  return {
    kind: 'background-owned',
    message: { type },
    sender,
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

it.each([
  [
    'missing settings sender URL',
    {},
    { authorized: false, reason: 'Unauthorized AI settings mutation sender' },
  ],
  [
    'malformed settings sender URL',
    { url: 'not a url' },
    { authorized: false, reason: 'Unauthorized AI settings mutation sender' },
  ],
  [
    'different extension page',
    { url: 'chrome-extension://test/src/options/index.html' },
    { authorized: false, reason: 'Unauthorized AI settings mutation sender' },
  ],
  [
    'unlock-mode settings page',
    { url: 'chrome-extension://test/apps/extension/src/settings/index.html?aiUnlock=1' },
    { authorized: false, reason: 'Unauthorized AI settings mutation sender: unlock mode' },
  ],
  [
    'ordinary settings page',
    { url: 'chrome-extension://test/apps/extension/src/settings/index.html' },
    { authorized: true },
  ],
] as const)('classifies %s for AI settings mutation authorization', (_label, sender, expected) => {
  expect(authorizeBackgroundOwnedRoute(aiSettingsMutationRequest(sender))).toEqual(expected);
});

it('surfaces AI secret unlock authorization failures', () => {
  authMocks.authorizeAISecretUnlockSender.mockReturnValueOnce('unlock denied');

  expect(authorizeBackgroundOwnedRoute(backgroundRequest(MessageType.AI_SECRET_UNLOCK))).toEqual({
    authorized: false,
    reason: 'unlock denied',
  });
});

it.each([
  ['missing page URL', {}, { authorized: false, reason: 'Unauthorized page access sender' }],
  [
    'popup page URL',
    { url: 'chrome-extension://test/apps/extension/src/popup/index.html' },
    { authorized: true },
  ],
  [
    'settings page URL',
    { url: 'chrome-extension://test/apps/extension/src/settings/index.html' },
    { authorized: true },
  ],
] as const)('authorizes page access from %s', (_label, sender, expected) => {
  expect(authorizeBackgroundOwnedRoute(backgroundRequest(MessageType.PAGE_ACCESS, sender))).toEqual(
    expected
  );
});

it('authorizes popup export and rejects popup capability senders through owner policy', () => {
  expect(
    authorizeBackgroundOwnedRoute(backgroundRequest(MessageType.STAGE_POPUP_EXPORT_ARCHIVE_CHUNK))
  ).toEqual({ authorized: true });

  authMocks.isPopupTabRouteSenderUrl.mockReturnValueOnce(false);
  expect(
    authorizeBackgroundOwnedRoute(backgroundRequest(MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY))
  ).toEqual({
    authorized: false,
    reason: 'Unauthorized tab route capability sender',
  });
});

it('delegates scenario editor LLM routes through the egress owner', () => {
  expect(
    authorizeBackgroundOwnedRoute(backgroundRequest(MessageType.PROCESS_SCENARIO_EDITOR_WITH_LLM))
  ).toEqual({ authorized: true });
  expect(authMocks.authorizeScenarioEditorLlmRoute).toHaveBeenCalledTimes(1);
});

it.each([
  MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY,
  MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN,
  MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF,
  MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
] as const)('authorizes content action %s issuance with typed sender binding', (type) => {
  const authorizationRequest = contentActionRequest(type);
  const expectedSenderBinding = {
    documentId: 'content-document-1',
    frameId: 0,
    senderUrl: 'https://example.test/page',
    tabId: 7,
  };
  const authorization = authorizeBackgroundOwnedRoute(authorizationRequest);

  expect(authorization).toEqual(
    expect.objectContaining({
      authorized: true,
      preauthorization: expect.objectContaining({
        kind: 'background-owned-route',
      }),
    })
  );
  if (!authorization.authorized) {
    throw new Error('Expected content action authorization to succeed');
  }
  expect(
    getContentActionCapabilityIssuanceSenderBinding(
      getBackgroundOwnedRouteContext(authorization.preauthorization),
      authorizationRequest.message
    )
  ).toEqual(expectedSenderBinding);
});

it.each([
  ['missing tab', { documentId: 'content-document-1', frameId: 0, url: 'https://example.test' }],
  [
    'subframe',
    {
      documentId: 'content-document-1',
      frameId: 1,
      tab: { id: 7 } as chrome.tabs.Tab,
      url: 'https://example.test',
    },
  ],
  [
    'missing document',
    { frameId: 0, tab: { id: 7 } as chrome.tabs.Tab, url: 'https://example.test' },
  ],
  [
    'empty document',
    { documentId: '', frameId: 0, tab: { id: 7 } as chrome.tabs.Tab, url: 'https://example.test' },
  ],
  [
    'missing url',
    { documentId: 'content-document-1', frameId: 0, tab: { id: 7 } as chrome.tabs.Tab },
  ],
  [
    'extension url',
    {
      documentId: 'content-document-1',
      frameId: 0,
      tab: { id: 7 } as chrome.tabs.Tab,
      url: 'chrome-extension://test/apps/extension/src/popup/index.html',
    },
  ],
] as const)('rejects content action issuance from %s sender', (_label, sender) => {
  expect(
    authorizeBackgroundOwnedRoute(
      contentActionRequest(MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN, sender)
    )
  ).toEqual({
    authorized: false,
    reason: 'Unauthorized content action capability sender',
  });
});
