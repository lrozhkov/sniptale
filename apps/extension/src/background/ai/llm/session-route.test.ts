import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { AiEgressAuthority } from '../../../features/ai/egress-authority';

const VALID_CONTENT_HASH =
  'sha256:1111111111111111111111111111111111111111111111111111111111111111';
const VALID_SCENARIO_HASH =
  'sha256:2222222222222222222222222222222222222222222222222222222222222222';

const {
  hasPreauthorizedLlmSessionRequestMessageMock,
  issueLlmSessionTokenMock,
  loadAISecretProtectionStatusMock,
  loggerErrorMock,
  loggerWarnMock,
  resolveLlmSessionSenderKeyMock,
} = vi.hoisted(() => ({
  hasPreauthorizedLlmSessionRequestMessageMock: vi.fn(),
  issueLlmSessionTokenMock: vi.fn(),
  loadAISecretProtectionStatusMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  resolveLlmSessionSenderKeyMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({ error: loggerErrorMock, warn: loggerWarnMock }),
}));

vi.mock('./session-tokens', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./session-tokens')>()),
  issueLlmSessionToken: issueLlmSessionTokenMock,
  resolveLlmSessionSenderKey: resolveLlmSessionSenderKeyMock,
}));

vi.mock('../../../composition/persistence/ai-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/ai-settings')>()),
  loadAISecretProtectionStatus: loadAISecretProtectionStatusMock,
}));

vi.mock('./authorization/preauthorization', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./authorization/preauthorization')>()),
  hasPreauthorizedLlmSessionRequestMessage: hasPreauthorizedLlmSessionRequestMessageMock,
}));

import { routeLlmSessionMessage } from './session-route';

function createContentAuthority(): AiEgressAuthority {
  return {
    captureMode: 'selected_editable',
    contractVersion: 1,
    payloadHash: VALID_CONTENT_HASH,
    purpose: 'content-ai-pick',
    riskClass: 'safe_text',
  };
}

function createScenarioAuthority(): AiEgressAuthority {
  return {
    attachmentSummary: { count: 0, items: [], totalDataUrlLength: 0 },
    contractVersion: 1,
    payloadHash: VALID_SCENARIO_HASH,
    purpose: 'scenario-editor',
    scenarioContractVersion: 3,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hasPreauthorizedLlmSessionRequestMessageMock.mockReturnValue(true);
  issueLlmSessionTokenMock.mockReturnValue('token-1');
  resolveLlmSessionSenderKeyMock.mockReturnValue('sender-key-1');
  loadAISecretProtectionStatusMock.mockResolvedValue({
    isEnabled: false,
    isUnlocked: true,
    mode: 'transparent',
  });
});

it('issues short-lived LLM session tokens for authorized senders', async () => {
  const sendResponse = vi.fn();
  const sender = { tab: { id: 7 } as chrome.tabs.Tab };

  expect(
    routeLlmSessionMessage(
      {
        egressAuthority: createContentAuthority(),
        type: MessageType.REQUEST_LLM_SESSION,
        purpose: 'content-ai-pick',
      },
      sender,
      sendResponse
    )
  ).toBe(true);

  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith({ success: true, token: 'token-1' });
  });
  expect(issueLlmSessionTokenMock).toHaveBeenCalledWith({
    egressAuthority: createContentAuthority(),
    purpose: 'content-ai-pick',
    sender,
  });
});

it('rejects unauthorized token requests without falling through', async () => {
  const sendResponse = vi.fn();
  hasPreauthorizedLlmSessionRequestMessageMock.mockReturnValue(false);

  expect(
    routeLlmSessionMessage(
      {
        egressAuthority: createScenarioAuthority(),
        type: MessageType.REQUEST_LLM_SESSION,
        purpose: 'scenario-editor',
      },
      { url: 'https://example.test/' },
      sendResponse
    )
  ).toBe(true);

  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: 'Unauthorized LLM session sender',
    });
  });
  expect(loggerWarnMock).toHaveBeenCalled();
  expect(loadAISecretProtectionStatusMock).not.toHaveBeenCalled();
});

it('returns a typed locked reason before issuing a provider-backed token', async () => {
  const sendResponse = vi.fn();
  const sender = { tab: { id: 7 } as chrome.tabs.Tab };
  loadAISecretProtectionStatusMock.mockResolvedValue({
    isEnabled: true,
    isUnlocked: false,
    mode: 'passphrase',
  });

  expect(
    routeLlmSessionMessage(
      {
        egressAuthority: createContentAuthority(),
        type: MessageType.REQUEST_LLM_SESSION,
        purpose: 'content-ai-pick',
      },
      sender,
      sendResponse
    )
  ).toBe(true);

  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      reason: 'ai-secrets-locked',
      error: 'AI provider secrets are locked',
    });
  });
  expect(issueLlmSessionTokenMock).not.toHaveBeenCalled();
});

it('reports token issuance failures after sender preauthorization', async () => {
  const sendResponse = vi.fn();
  issueLlmSessionTokenMock.mockReturnValue(null);

  expect(
    routeLlmSessionMessage(
      {
        egressAuthority: createContentAuthority(),
        type: MessageType.REQUEST_LLM_SESSION,
        purpose: 'content-ai-pick',
      },
      { tab: { id: 7 } as chrome.tabs.Tab },
      sendResponse
    )
  ).toBe(true);

  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: 'Unable to issue LLM session token',
    });
  });
});
