import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createAiPrivacyProof, type LlmPrivacyPayload } from '../../../features/ai/privacy';

const {
  hasPreauthorizedLlmRouteMessageMock,
  processMultiProviderRequestMock,
  resolveModelConfigMock,
} = vi.hoisted(() => ({
  hasPreauthorizedLlmRouteMessageMock: vi.fn(),
  processMultiProviderRequestMock: vi.fn(),
  resolveModelConfigMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    child: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('../../../composition/persistence/ai-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/ai-settings')>()),

  initializeAiStorageAccess: vi.fn(),
  loadDefaultModelId: vi.fn(),
}));

vi.mock('./model-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./model-config')>()),
  resolveModelConfig: resolveModelConfigMock,
}));

vi.mock('./router-processing', () => ({
  processMultiProviderRequest: processMultiProviderRequestMock,
}));

vi.mock('./service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./service')>()),
  saveRequestHistory: vi.fn(),
}));

vi.mock('./authorization/preauthorization', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./authorization/preauthorization')>()),
  hasPreauthorizedLlmRouteMessage: hasPreauthorizedLlmRouteMessageMock,
}));

import { routeLlmMessage } from './router';

function createSender(): chrome.runtime.MessageSender {
  return { tab: { id: 42 } as chrome.tabs.Tab };
}

async function withPrivacyProof<T extends LlmPrivacyPayload>(
  payload: T
): Promise<T & { privacyProof: Awaited<ReturnType<typeof createAiPrivacyProof>> }> {
  return {
    ...payload,
    privacyProof: await createAiPrivacyProof({
      captureMode: 'selected_editable',
      payload,
      riskClass: 'safe_text',
      userInitiatedAiExtraction: true,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hasPreauthorizedLlmRouteMessageMock.mockReturnValue(true);
});

it('returns false for unrelated or malformed LLM messages', () => {
  const sendResponse = vi.fn();

  expect(routeLlmMessage({ type: MessageType.SHOW_TOOLBAR }, sendResponse, createSender())).toBe(
    false
  );
  expect(
    routeLlmMessage(
      {
        type: MessageType.PROCESS_WITH_LLM,
        prompt: 'Normalize selected nodes',
        data: [{ id: 'node-1', text: 42 }],
      },
      sendResponse,
      createSender()
    )
  ).toBe(false);
  expect(sendResponse).not.toHaveBeenCalled();
  expect(resolveModelConfigMock).not.toHaveBeenCalled();
});

it('rejects requests without a valid sender-bound token before model resolution', async () => {
  const sendResponse = vi.fn();
  hasPreauthorizedLlmRouteMessageMock.mockReturnValueOnce(false);

  expect(
    routeLlmMessage(
      {
        type: MessageType.PROCESS_WITH_LLM,
        llmSessionToken: 'forged-token',
        prompt: 'Normalize selected nodes',
        ...(await withPrivacyProof({ jsonData: '{"fields":[]}' })),
      },
      sendResponse,
      createSender()
    )
  ).toBe(true);

  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'Unauthorized LLM request',
  });
  expect(resolveModelConfigMock).not.toHaveBeenCalled();
  expect(processMultiProviderRequestMock).not.toHaveBeenCalled();
});

it('rejects oversized payloads before model resolution', async () => {
  const sendResponse = vi.fn();

  expect(
    routeLlmMessage(
      {
        type: MessageType.PROCESS_WITH_LLM,
        llmSessionToken: 'llm-token-1',
        prompt: 'x'.repeat(16_001),
        ...(await withPrivacyProof({ jsonData: '{"fields":[]}' })),
      },
      sendResponse,
      createSender()
    )
  ).toBe(true);

  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'prompt exceeds 16000 characters',
  });
  expect(resolveModelConfigMock).not.toHaveBeenCalled();
  expect(processMultiProviderRequestMock).not.toHaveBeenCalled();
});
