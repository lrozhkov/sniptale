import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createContentAiEgressAuthority } from '../../../../features/ai/egress-authority';
import { createAiPrivacyProof } from '../../../../features/ai/privacy';
import {
  issueLlmSessionToken,
  resetLlmSessionTokensForTests,
} from '../../../ai/llm/session-tokens';
import type { BackgroundOwnedAction } from './types';

const { routeLlmMessageMock } = vi.hoisted(() => ({
  routeLlmMessageMock: vi.fn(),
}));

const { authorizeBackgroundOwnedRouteMaybeAsyncMock } = vi.hoisted(() => ({
  authorizeBackgroundOwnedRouteMaybeAsyncMock: vi.fn(),
}));

vi.mock('../../../ai/routes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../ai/routes')>()),
  routeLlmMessage: routeLlmMessageMock,
}));

vi.mock('../authorization/owned', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../authorization/owned')>()),
  authorizeBackgroundOwnedRouteMaybeAsync: authorizeBackgroundOwnedRouteMaybeAsyncMock,
}));

import { routeBackgroundOwnedAction } from './owned-route';

const CONTENT_URL = 'https://example.test/page';

function createSender(): chrome.runtime.MessageSender {
  return {
    documentId: 'document-7',
    frameId: 0,
    tab: { id: 7 } as chrome.tabs.Tab,
    url: CONTENT_URL,
  };
}

function createAction(
  message: BackgroundOwnedAction['message'],
  sender = createSender()
): BackgroundOwnedAction {
  return {
    actionKind: 'background-owned',
    context: {
      documentId: sender.documentId ?? null,
      frameId: sender.frameId ?? null,
      logger: { error: vi.fn(), warn: vi.fn() },
      origin: 'https://example.test',
      runtimeState: {} as BackgroundOwnedAction['context']['runtimeState'],
      sendResponse: vi.fn(),
      sender,
      senderUrl: sender.url ?? null,
      tabId: sender.tab?.id ?? null,
    },
    message,
    routeName: `background-owned:${message.type}`,
  };
}

async function createPrivacyProof(payload: { jsonData: string }) {
  return createAiPrivacyProof({
    captureMode: 'selected_editable',
    payload,
    riskClass: 'safe_text',
    userInitiatedAiExtraction: true,
  });
}

async function createAuthorizedMessage(payload: { jsonData: string }) {
  const sender = createSender();
  const privacyProof = await createPrivacyProof(payload);
  const token = issueLlmSessionToken({
    egressAuthority: await createContentAiEgressAuthority({ payload, privacyProof }),
    purpose: 'content-ai-pick',
    sender,
  });
  return {
    message: {
      ...payload,
      llmSessionToken: token ?? '',
      privacyProof,
      prompt: 'Normalize selected nodes',
      type: MessageType.PROCESS_WITH_LLM,
    },
    sender,
  };
}

function stubCryptoRandomUuid(): void {
  const originalCrypto = globalThis.crypto;
  vi.stubGlobal('crypto', {
    get subtle() {
      return originalCrypto.subtle;
    },
    randomUUID: () => 'token-1',
  });
}

beforeEach(() => {
  resetLlmSessionTokensForTests();
  authorizeBackgroundOwnedRouteMaybeAsyncMock.mockReset();
  authorizeBackgroundOwnedRouteMaybeAsyncMock.mockImplementation(async (request) => {
    const { authorizeBackgroundOwnedRouteMaybeAsync } =
      await vi.importActual<typeof import('../authorization/owned')>('../authorization/owned');
    return authorizeBackgroundOwnedRouteMaybeAsync(request);
  });
  routeLlmMessageMock.mockReset();
  routeLlmMessageMock.mockReturnValue(true);
  stubCryptoRandomUuid();
});

afterEach(() => {
  resetLlmSessionTokensForTests();
  vi.unstubAllGlobals();
});

it('keeps the channel open while async LLM authorization resolves before dispatch', async () => {
  const { message, sender } = await createAuthorizedMessage({ jsonData: '{"fields":[]}' });
  const action = createAction(message, sender);

  expect(routeBackgroundOwnedAction(action)).toEqual({ handled: true, keepChannelOpen: true });
  await vi.waitFor(() => {
    expect(routeLlmMessageMock).toHaveBeenCalledWith(message, action.context.sendResponse, sender);
  });
});

it('rejects async LLM authorization failures before route dispatch', async () => {
  const issuedPayload = { jsonData: '{"fields":[{"id":"issued"}]}' };
  const submittedPayload = { jsonData: '{"fields":[{"id":"changed"}]}' };
  const { message, sender } = await createAuthorizedMessage(issuedPayload);
  const action = createAction({ ...message, ...submittedPayload }, sender);

  expect(routeBackgroundOwnedAction(action)).toEqual({ handled: true, keepChannelOpen: true });
  await vi.waitFor(() => {
    expect(action.context.sendResponse).toHaveBeenCalledWith({
      error: 'AI privacy proof payload binding mismatch',
      success: false,
    });
  });
  expect(routeLlmMessageMock).not.toHaveBeenCalled();
});

it('fails closed when async background-owned authorization rejects', async () => {
  const { message, sender } = await createAuthorizedMessage({ jsonData: '{"fields":[]}' });
  const action = createAction(message, sender);
  authorizeBackgroundOwnedRouteMaybeAsyncMock.mockRejectedValueOnce(new Error('digest failed'));

  expect(routeBackgroundOwnedAction(action)).toEqual({ handled: true, keepChannelOpen: true });
  await vi.waitFor(() => {
    expect(action.context.sendResponse).toHaveBeenCalledWith({
      error: 'Background-owned authorization failed',
      success: false,
    });
  });
  expect(routeLlmMessageMock).not.toHaveBeenCalled();
});

it('fails closed when authorized background-owned dispatch declines the route', async () => {
  const { message, sender } = await createAuthorizedMessage({ jsonData: '{"fields":[]}' });
  const action = createAction(message, sender);
  routeLlmMessageMock.mockReturnValueOnce(false);

  expect(routeBackgroundOwnedAction(action)).toEqual({ handled: true, keepChannelOpen: true });
  await vi.waitFor(() => {
    expect(action.context.sendResponse).toHaveBeenCalledWith({
      error: 'Unsupported action route',
      success: false,
    });
  });
});
