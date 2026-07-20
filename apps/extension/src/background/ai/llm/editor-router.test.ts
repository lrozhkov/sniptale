import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { type ProcessScenarioEditorWithLLMResponse } from '../../../contracts/ai/scenario';
import { translate } from '../../../platform/i18n';
const {
  initializeAiStorageAccessMock,
  extractJSONMock,
  loadDefaultModelIdMock,
  loadScenarioEditorSystemPromptMock,
  loggerDebugMock,
  loggerErrorMock,
  hasPreauthorizedScenarioEditorLlmRouteMessageMock,
  requestMultimodalChatCompletionMock,
  resolveModelConfigMock,
} = vi.hoisted(() => ({
  initializeAiStorageAccessMock: vi.fn(),
  extractJSONMock: vi.fn(),
  loadDefaultModelIdMock: vi.fn(),
  loadScenarioEditorSystemPromptMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  hasPreauthorizedScenarioEditorLlmRouteMessageMock: vi.fn(),
  requestMultimodalChatCompletionMock: vi.fn(),
  resolveModelConfigMock: vi.fn(),
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
  requestMultimodalChatCompletionMock.mockResolvedValue('{"operations":[]}');
  extractJSONMock.mockImplementation((value: string) => value);
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

beforeEach(resetScenarioEditorRouterMocks);

it('routes scenario-editor multimodal requests and parses the strict JSON payload', async () => {
  const sendResponse = vi.fn();

  expect(routeScenarioEditorLlmMessage(createMessage(), sendResponse, createSender())).toBe(true);
  await expectSuccessfulResponse(sendResponse);

  expect(loadDefaultModelIdMock).toHaveBeenCalledTimes(1);
  expect(resolveModelConfigMock).toHaveBeenCalledWith('model-1');
  expect(loadScenarioEditorSystemPromptMock).toHaveBeenCalledTimes(1);
  expect(requestMultimodalChatCompletionMock).toHaveBeenCalledWith({
    apiKey: 'secret-key',
    baseUrl: 'https://api.openai.com/v1',
    modelCode: 'gpt-4.1',
    providerErrorLabel: 'provider-1',
    systemPrompt: 'Scenario editor system prompt',
    userContent: [
      {
        type: 'text',
        text: [
          'User instruction:',
          'Rewrite step titles',
          '',
          'Project outline JSON:',
          '{}',
          '',
          'Selected slide code JSON:',
          '{}',
          '',
          'Tool manifest JSON:',
          '{}',
          '',
          'Project snapshot JSON:',
          '{"steps":[]}',
          '',
          'Return ONLY strict JSON with the shape {"operations":[...]} using the tool manifest.',
        ].join('\n'),
      },
      {
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,YWFh' },
      },
    ],
  });
  expect(sendResponse).toHaveBeenCalledWith({ operations: [], success: true });
});

it('redacts sensitive scenario text before provider egress', async () => {
  const sendResponse = vi.fn();
  const message = {
    ...createMessage(),
    instruction: 'Use Authorization: Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==',
    projectSnapshotJson: '{"csrf":"csrf-secret","safe":"Display name"}',
  };

  expect(routeScenarioEditorLlmMessage(message, sendResponse, createSender())).toBe(true);
  await expectSuccessfulResponse(sendResponse);

  const request = requestMultimodalChatCompletionMock.mock.calls[0]?.[0] as {
    userContent: Array<{ text?: string; type: string }>;
  };
  const text = request.userContent.find((part) => part.type === 'text')?.text ?? '';
  expect(text).not.toContain('QWxhZGRpbjpvcGVuIHNlc2FtZQ');
  expect(text).not.toContain('csrf-secret');
  expect(text).toContain('Display name');
});

it('prefers an explicit model id over the stored default model selection', async () => {
  const sendResponse = vi.fn();

  expect(
    routeScenarioEditorLlmMessage(
      {
        ...createMessage(),
        modelId: 'model-explicit',
      },
      sendResponse,
      createSender()
    )
  ).toBe(true);

  await expectSuccessfulResponse(sendResponse);
  expect(loadDefaultModelIdMock).not.toHaveBeenCalled();
  expect(resolveModelConfigMock).toHaveBeenCalledWith('model-explicit');
});

it('returns the translated missing-model error when no explicit or default model exists', async () => {
  const sendResponse = vi.fn();
  loadDefaultModelIdMock.mockResolvedValue(null);

  expect(routeScenarioEditorLlmMessage(createMessage(), sendResponse, createSender())).toBe(true);

  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith({
      error: translate('background.runtime.llmModelMissing'),
      success: false,
    });
  });
});

it('surfaces schema parse failures without exposing raw provider output', async () => {
  const sendResponse = vi.fn();
  requestMultimodalChatCompletionMock.mockResolvedValue('{"steps":[{"stepId":1}]}');

  expect(routeScenarioEditorLlmMessage(createMessage(), sendResponse, createSender())).toBe(true);

  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith({
      error: translate('background.runtime.llmUnexpectedResponse'),
      success: false,
    });
  });
});

it('surfaces v3 schema parse failures without exposing raw provider output', async () => {
  const sendResponse = vi.fn();
  requestMultimodalChatCompletionMock.mockResolvedValue('{"operations":"broken"}');

  expect(
    routeScenarioEditorLlmMessage(
      {
        ...createMessage(),
        attachments: [],
      },
      sendResponse,
      createSender()
    )
  ).toBe(true);

  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith({
      error: translate('background.runtime.llmUnexpectedResponse'),
      success: false,
    });
  });
});

it('normalizes invalid JSON text into a product-facing parse failure response', async () => {
  const sendResponse = vi.fn();
  requestMultimodalChatCompletionMock.mockResolvedValue('not-json');

  expect(routeScenarioEditorLlmMessage(createMessage(), sendResponse, createSender())).toBe(true);

  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith({
      error: translate('background.runtime.llmUnexpectedResponse'),
      success: false,
    });
  });
});

it.each([
  [
    new Error('Vision is not supported by the selected model'),
    'Vision is not supported by the selected model',
    true,
  ],
  ['broken', translate('content.runtime.unknownError'), false],
])(
  'normalizes thrown provider errors into the response payload',
  async (thrownError, error, logs) => {
    const sendResponse = vi.fn();
    requestMultimodalChatCompletionMock.mockRejectedValue(thrownError);

    expect(routeScenarioEditorLlmMessage(createMessage(), sendResponse, createSender())).toBe(true);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        error,
        success: false,
      });
    });
    if (logs) {
      expect(loggerErrorMock).toHaveBeenCalled();
    }
  }
);
