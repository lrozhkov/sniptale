import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { type ProcessScenarioEditorWithLLMResponse } from '../../../contracts/ai/scenario';

const {
  extractJSONMock,
  initializeAiStorageAccessMock,
  loadDefaultModelIdMock,
  loadScenarioEditorSystemPromptMock,
  hasPreauthorizedScenarioEditorLlmRouteMessageMock,
  requestMultimodalChatCompletionMock,
  resolveModelConfigMock,
} = vi.hoisted(() => ({
  extractJSONMock: vi.fn(),
  initializeAiStorageAccessMock: vi.fn(),
  loadDefaultModelIdMock: vi.fn(),
  loadScenarioEditorSystemPromptMock: vi.fn(),
  hasPreauthorizedScenarioEditorLlmRouteMessageMock: vi.fn(),
  requestMultimodalChatCompletionMock: vi.fn(),
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

  loadDefaultModelId: loadDefaultModelIdMock,
  loadScenarioEditorSystemPrompt: loadScenarioEditorSystemPromptMock,
  initializeAiStorageAccess: initializeAiStorageAccessMock,
}));

vi.mock('./model-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./model-config')>()),
  resolveModelConfig: resolveModelConfigMock,
}));

vi.mock('./transport/request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./transport/request')>()),
  extractJSON: extractJSONMock,
  requestMultimodalChatCompletion: requestMultimodalChatCompletionMock,
}));

vi.mock('./authorization/preauthorization', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./authorization/preauthorization')>()),
  hasPreauthorizedScenarioEditorLlmRouteMessage: hasPreauthorizedScenarioEditorLlmRouteMessageMock,
}));

import { routeScenarioEditorLlmMessage } from './editor-router';

const populatedOperationResponse = {
  operations: [{ slideId: 'slide-1', title: 'Updated title', type: 'setSlideTitle' }],
} as const;

function createMessage() {
  return {
    type: MessageType.PROCESS_SCENARIO_EDITOR_WITH_LLM,
    contractVersion: 3,
    llmSessionToken: 'llm-token-1',
    instruction: 'Rewrite step titles',
    projectSnapshotJson: '{"steps":[]}',
    attachments: [
      {
        stepId: 'step-1',
        stepNumber: 1,
        filename: 'step1.png',
        mimeType: 'image/png',
        dataUrl: 'data:image/png;base64,YWFh',
      },
    ],
  } as const;
}

function createResolvedConfig() {
  return {
    providerId: 'provider-1',
    modelId: 'model-1',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'secret-key',
    modelCode: 'gpt-4.1',
    effectiveSystemPrompt: 'unused here',
  };
}

function resetScenarioEditorRouterMocks() {
  vi.clearAllMocks();
  hasPreauthorizedScenarioEditorLlmRouteMessageMock.mockReturnValue(true);
  initializeAiStorageAccessMock.mockResolvedValue(undefined);
  loadDefaultModelIdMock.mockResolvedValue('model-1');
  loadScenarioEditorSystemPromptMock.mockResolvedValue('Scenario editor system prompt');
  resolveModelConfigMock.mockResolvedValue(createResolvedConfig());
  requestMultimodalChatCompletionMock.mockResolvedValue(JSON.stringify(populatedOperationResponse));
  extractJSONMock.mockImplementation((value: string) => value);
}

function createSender(): chrome.runtime.MessageSender {
  return { url: 'chrome-extension://test/apps/extension/src/scenario-editor/index.html' };
}

beforeEach(resetScenarioEditorRouterMocks);

it('keeps v3 operation fields when the provider returns operations', async () => {
  const sendResponse = vi.fn();

  expect(routeScenarioEditorLlmMessage(createMessage(), sendResponse, createSender())).toBe(true);

  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith({
      operations: [...populatedOperationResponse.operations],
      success: true,
    } satisfies ProcessScenarioEditorWithLLMResponse);
  });
});
