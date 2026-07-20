import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { type ProcessWithLLMResponse } from '../../../contracts/messaging/llm';
import { translate } from '../../../platform/i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withPrivacyProof } from './router.test-support';
const {
  initializeAiStorageAccessMock,
  loadDefaultModelIdMock,
  loggerErrorMock,
  loggerDebugMock,
  hasPreauthorizedLlmRouteMessageMock,
  processMultiProviderRequestMock,
  resolveModelConfigMock,
  saveRequestHistoryMock,
} = vi.hoisted(() => ({
  initializeAiStorageAccessMock: vi.fn(),
  loadDefaultModelIdMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  hasPreauthorizedLlmRouteMessageMock: vi.fn(),
  processMultiProviderRequestMock: vi.fn(),
  resolveModelConfigMock: vi.fn(),
  saveRequestHistoryMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    child: vi.fn(),
    debug: loggerDebugMock,
    error: loggerErrorMock,
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('../../../composition/persistence/ai-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/ai-settings')>()),

  loadDefaultModelId: loadDefaultModelIdMock,
  initializeAiStorageAccess: initializeAiStorageAccessMock,
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
  saveRequestHistory: saveRequestHistoryMock,
}));

vi.mock('./authorization/preauthorization', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./authorization/preauthorization')>()),
  hasPreauthorizedLlmRouteMessage: hasPreauthorizedLlmRouteMessageMock,
}));

import { routeLlmMessage } from './router';

function createResolvedConfig() {
  return {
    providerId: 'provider-1',
    modelId: 'model-1',
    baseUrl: 'http://127.0.0.1:11434/v1',
    apiKey: 'secret-key',
    modelCode: 'llama3.2',
    effectiveSystemPrompt: 'Return valid JSON only',
  };
}

function resetLlmRouterMocks() {
  vi.clearAllMocks();
  hasPreauthorizedLlmRouteMessageMock.mockReturnValue(true);
  initializeAiStorageAccessMock.mockResolvedValue(undefined);
  loadDefaultModelIdMock.mockResolvedValue('model-1');
  resolveModelConfigMock.mockResolvedValue(createResolvedConfig());
  saveRequestHistoryMock.mockResolvedValue(undefined);
  processMultiProviderRequestMock.mockResolvedValue({
    success: true,
    changes: [],
    parseErrors: [],
    data: [{ id: 'node-2', text: 'Updated text' }],
  });
}

function createSender(): chrome.runtime.MessageSender {
  return { tab: { id: 42 } as chrome.tabs.Tab };
}

async function verifyRoutesExplicitModelJsonRequest() {
  const sendResponse = vi.fn();
  const message = {
    type: MessageType.PROCESS_WITH_LLM,
    llmSessionToken: 'llm-token-1',
    prompt: 'Normalize selected nodes',
    modelId: 'model-explicit',
    ...(await withPrivacyProof({ jsonData: '{"fields":[]}' })),
  };

  expect(routeLlmMessage(message, sendResponse, createSender())).toBe(true);
  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      changes: [],
      data: [{ id: 'node-2', text: 'Updated text' }],
      parseErrors: [],
    });
  });

  expect(loadDefaultModelIdMock).not.toHaveBeenCalled();
  expect(resolveModelConfigMock).toHaveBeenCalledWith('model-explicit');
  expect(processMultiProviderRequestMock).toHaveBeenCalledWith(message, createResolvedConfig());
  expect(loggerDebugMock).toHaveBeenCalledWith('Processing LLM request', {
    hasJsonData: true,
    hasMarkdownData: false,
    modelId: 'model-explicit',
    promptLength: 24,
  });
  expect(saveRequestHistoryMock).not.toHaveBeenCalled();
}

async function verifyDefaultModelFallbackError() {
  const sendResponse = vi.fn();
  loadDefaultModelIdMock.mockResolvedValue(null);

  expect(
    routeLlmMessage(
      {
        type: MessageType.PROCESS_WITH_LLM,
        llmSessionToken: 'llm-token-1',
        prompt: 'Normalize selected nodes',
        ...(await withPrivacyProof({ markdownData: '| a |\n| - |' })),
      },
      sendResponse,
      createSender()
    )
  ).toBe(true);

  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: translate('background.runtime.llmModelMissing'),
    });
  });

  expect(resolveModelConfigMock).not.toHaveBeenCalled();
  expect(saveRequestHistoryMock).toHaveBeenCalledWith({
    errorCode: 'model-missing',
    requestKind: 'markdown',
    resultCount: 0,
    status: 'failure',
  });
}

async function verifyStructuredProcessingErrorPropagation() {
  const sendResponse = vi.fn();
  processMultiProviderRequestMock.mockRejectedValue({
    success: false,
    error: 'Provider returned invalid JSON',
  } satisfies ProcessWithLLMResponse);

  expect(
    routeLlmMessage(
      {
        type: MessageType.PROCESS_WITH_LLM,
        llmSessionToken: 'llm-token-1',
        prompt: 'Normalize selected nodes',
        ...(await withPrivacyProof({ jsonData: '{"fields":[]}' })),
      },
      sendResponse,
      createSender()
    )
  ).toBe(true);

  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: 'Provider returned invalid JSON',
    });
  });

  expect(saveRequestHistoryMock).toHaveBeenCalledWith({
    errorCode: 'provider-invalid-response',
    requestKind: 'json',
    resultCount: 0,
    status: 'failure',
  });
  expect(loggerErrorMock).toHaveBeenCalled();
}

async function verifyJsonRequestsSkipLegacyHistoryPersistence() {
  const sendResponse = vi.fn();

  expect(
    routeLlmMessage(
      {
        type: MessageType.PROCESS_WITH_LLM,
        llmSessionToken: 'llm-token-1',
        prompt: 'Normalize selected nodes',
        ...(await withPrivacyProof({ jsonData: '{"fields":[]}' })),
      },
      sendResponse,
      createSender()
    )
  ).toBe(true);

  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      changes: [],
      data: [{ id: 'node-2', text: 'Updated text' }],
      parseErrors: [],
    });
  });

  expect(saveRequestHistoryMock).not.toHaveBeenCalled();
}

function verifyRejectsUnrelatedMessages() {
  expect(routeLlmMessage({ type: MessageType.SHOW_TOOLBAR }, vi.fn(), createSender())).toBe(false);
}

async function verifyRejectsUnauthorizedMessages() {
  const sendResponse = vi.fn();
  hasPreauthorizedLlmRouteMessageMock.mockReturnValue(false);

  expect(
    routeLlmMessage(
      {
        type: MessageType.PROCESS_WITH_LLM,
        llmSessionToken: 'llm-token-1',
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
}

async function verifyRejectsOversizedPayloads() {
  const sendResponse = vi.fn();

  expect(
    routeLlmMessage(
      {
        type: MessageType.PROCESS_WITH_LLM,
        llmSessionToken: 'llm-token-1',
        prompt: 'Normalize selected nodes',
        ...(await withPrivacyProof({ jsonData: '\u0800'.repeat(700_000) })),
      },
      sendResponse,
      createSender()
    )
  ).toBe(true);

  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'jsonData exceeds 2000000 decoded bytes',
  });
}

describe('router', () => {
  beforeEach(resetLlmRouterMocks);

  it('ignores unrelated runtime messages', verifyRejectsUnrelatedMessages);
  it('rejects LLM messages without route preauthorization', verifyRejectsUnauthorizedMessages);
  it('rejects oversized LLM payloads before provider work', verifyRejectsOversizedPayloads);

  it(
    'routes explicit model JSON requests without legacy history writes',
    verifyRoutesExplicitModelJsonRequest
  );
  it(
    'returns the translated missing-model error when no explicit or default model exists',
    verifyDefaultModelFallbackError
  );
  it(
    'propagates structured processing errors to the response payload',
    verifyStructuredProcessingErrorPropagation
  );
  it(
    'does not persist legacy history metadata for structured json requests',
    verifyJsonRequestsSkipLegacyHistoryPersistence
  );
});
