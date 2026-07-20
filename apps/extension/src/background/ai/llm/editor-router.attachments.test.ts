import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { type ProcessScenarioEditorWithLLMResponse } from '../../../contracts/ai/scenario';

const {
  initializeAiStorageAccessMock,
  extractJSONMock,
  loadDefaultModelIdMock,
  loadScenarioEditorSystemPromptMock,
  loggerDebugMock,
  hasPreauthorizedScenarioEditorLlmRouteMessageMock,
  requestMultimodalChatCompletionMock,
  resolveModelConfigMock,
} = vi.hoisted(() => ({
  initializeAiStorageAccessMock: vi.fn(),
  extractJSONMock: vi.fn(),
  loadDefaultModelIdMock: vi.fn(),
  loadScenarioEditorSystemPromptMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  hasPreauthorizedScenarioEditorLlmRouteMessageMock: vi.fn(),
  requestMultimodalChatCompletionMock: vi.fn(),
  resolveModelConfigMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    child: vi.fn(),
    debug: loggerDebugMock,
    error: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('../../../composition/persistence/ai-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/ai-settings')>()),

  initializeAiStorageAccess: initializeAiStorageAccessMock,
  loadDefaultModelId: loadDefaultModelIdMock,
  loadScenarioEditorSystemPrompt: loadScenarioEditorSystemPromptMock,
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

function createMessage() {
  return {
    attachments: [
      {
        dataUrl: 'data:image/png;base64,YWFh',
        filename: 'step1.png',
        mimeType: 'image/png',
        stepId: 'step-1',
        stepNumber: 1,
      },
    ],
    contractVersion: 3,
    instruction: 'Rewrite step titles',
    llmSessionToken: 'llm-token-1',
    projectSnapshotJson: '{"steps":[]}',
    type: MessageType.PROCESS_SCENARIO_EDITOR_WITH_LLM,
  } as const;
}

function createSender(): chrome.runtime.MessageSender {
  return { url: 'chrome-extension://test/apps/extension/src/scenario-editor/index.html' };
}

function expectSuccessfulResponse(sendResponse: ReturnType<typeof vi.fn>) {
  return vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith({
      operations: [],
      success: true,
    } satisfies ProcessScenarioEditorWithLLMResponse);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  hasPreauthorizedScenarioEditorLlmRouteMessageMock.mockReturnValue(true);
  initializeAiStorageAccessMock.mockResolvedValue(undefined);
  loadDefaultModelIdMock.mockResolvedValue('model-1');
  loadScenarioEditorSystemPromptMock.mockResolvedValue('Scenario editor system prompt');
  resolveModelConfigMock.mockResolvedValue({
    apiKey: 'secret-key',
    baseUrl: 'https://api.openai.com/v1',
    modelCode: 'gpt-4.1',
    modelId: 'model-1',
    providerId: 'provider-1',
  });
  requestMultimodalChatCompletionMock.mockResolvedValue('{"operations":[]}');
  extractJSONMock.mockImplementation((value: string) => value);
});

it('omits image parts when scenario screenshot attachments are absent', async () => {
  const sendResponse = vi.fn();
  expect(
    routeScenarioEditorLlmMessage(
      { ...createMessage(), attachments: [] },
      sendResponse,
      createSender()
    )
  ).toBe(true);
  await expectSuccessfulResponse(sendResponse);

  const request = requestMultimodalChatCompletionMock.mock.calls[0]?.[0] as {
    userContent: Array<{ type: string }>;
  };
  expect(request.userContent.every((part) => part.type !== 'image_url')).toBe(true);
});

it('does not write raw scenario screenshot data URLs to route logs', async () => {
  const sendResponse = vi.fn();
  const dataUrl = 'data:image/png;base64,cmF3LXNjcmVlbnNob3QtbWFya2Vy';
  expect(
    routeScenarioEditorLlmMessage(
      {
        ...createMessage(),
        attachments: [{ ...createMessage().attachments[0], dataUrl }],
      },
      sendResponse,
      createSender()
    )
  ).toBe(true);
  await expectSuccessfulResponse(sendResponse);

  const loggedText = JSON.stringify(loggerDebugMock.mock.calls);
  expect(loggedText).toContain('attachmentCount');
  expect(loggedText).not.toContain(dataUrl);
  expect(loggedText).not.toContain('cmF3LXNjcmVlbnNob3QtbWFya2Vy');
});
