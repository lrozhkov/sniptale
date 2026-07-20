import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { type ProcessScenarioEditorWithLLMResponse } from '../../../contracts/ai/scenario';

const {
  extractJSONMock,
  hasPreauthorizedScenarioEditorLlmRouteMessageMock,
  initializeAiStorageAccessMock,
  loadDefaultModelIdMock,
  loadScenarioEditorSystemPromptMock,
  requestMultimodalChatCompletionMock,
  resolveModelConfigMock,
} = vi.hoisted(() => ({
  extractJSONMock: vi.fn(),
  hasPreauthorizedScenarioEditorLlmRouteMessageMock: vi.fn(),
  initializeAiStorageAccessMock: vi.fn(),
  loadDefaultModelIdMock: vi.fn(),
  loadScenarioEditorSystemPromptMock: vi.fn(),
  requestMultimodalChatCompletionMock: vi.fn(),
  resolveModelConfigMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({ debug: vi.fn(), error: vi.fn(), warn: vi.fn() }),
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
    attachments: [],
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
    effectiveSystemPrompt: 'unused here',
    modelCode: 'gpt-4.1',
    modelId: 'model-1',
    providerId: 'provider-1',
  });
  requestMultimodalChatCompletionMock.mockResolvedValue('{"operations":[]}');
  extractJSONMock.mockImplementation((value: string) => value);
});

it('canonicalizes scenario URLs before provider egress', async () => {
  const sendResponse = vi.fn();
  const message = {
    ...createMessage(),
    projectSnapshotJson:
      '{"steps":[{"page":{"url":"https://user:pass@example.test/path?token=secret#hash"}}]}',
  };

  expect(routeScenarioEditorLlmMessage(message, sendResponse, createSender())).toBe(true);
  await expectSuccessfulResponse(sendResponse);

  const request = requestMultimodalChatCompletionMock.mock.calls[0]?.[0] as {
    userContent: Array<{ text?: string; type: string }>;
  };
  const text = request.userContent.find((part) => part.type === 'text')?.text ?? '';
  expect(text).toContain('https://example.test/path');
  expect(text).not.toContain('user:pass');
  expect(text).not.toContain('token=secret');
  expect(text).not.toContain('#hash');
});

it('rejects malformed scenario project JSON before provider work', () => {
  const sendResponse = vi.fn();

  expect(
    routeScenarioEditorLlmMessage(
      { ...createMessage(), projectSnapshotJson: 'not-json' },
      sendResponse,
      createSender()
    )
  ).toBe(true);

  expect(sendResponse).toHaveBeenCalledWith({
    error: 'projectSnapshotJson must be valid JSON',
    success: false,
  });
  expect(resolveModelConfigMock).not.toHaveBeenCalled();
  expect(requestMultimodalChatCompletionMock).not.toHaveBeenCalled();
});

it('ignores messages outside the scenario editor LLM contract', () => {
  expect(routeScenarioEditorLlmMessage({ type: 'OTHER' }, vi.fn(), createSender())).toBe(false);
});

it('rejects scenario editor LLM messages that were not preauthorized', () => {
  const sendResponse = vi.fn();
  hasPreauthorizedScenarioEditorLlmRouteMessageMock.mockReturnValue(false);

  expect(routeScenarioEditorLlmMessage(createMessage(), sendResponse, createSender())).toBe(true);

  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Unauthorized LLM request',
    success: false,
  });
  expect(requestMultimodalChatCompletionMock).not.toHaveBeenCalled();
});

it('normalizes legacy step and invalid v3 provider schema failures', async () => {
  const sendResponse = vi.fn();
  requestMultimodalChatCompletionMock.mockResolvedValueOnce('{"steps":[{"stepId":1}]}');

  expect(routeScenarioEditorLlmMessage(createMessage(), sendResponse, createSender())).toBe(true);
  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith({
      error: expect.any(String),
      success: false,
    });
  });

  sendResponse.mockClear();
  requestMultimodalChatCompletionMock.mockResolvedValueOnce('{"operations":"broken"}');
  expect(
    routeScenarioEditorLlmMessage(
      { ...createMessage(), contractVersion: 3 as const },
      sendResponse,
      createSender()
    )
  ).toBe(true);
  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith({
      error: expect.any(String),
      success: false,
    });
  });
});

it('uses canonical empty JSON defaults for missing v3 optional payload fields', async () => {
  const sendResponse = vi.fn();
  const message = {
    ...createMessage(),
    contractVersion: 3 as const,
  };
  requestMultimodalChatCompletionMock.mockResolvedValue('{"operations":[]}');

  expect(routeScenarioEditorLlmMessage(message, sendResponse, createSender())).toBe(true);
  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith({ operations: [], success: true });
  });

  const request = requestMultimodalChatCompletionMock.mock.calls[0]?.[0] as {
    userContent: Array<{ text?: string; type: string }>;
  };
  const text = request.userContent.find((part) => part.type === 'text')?.text ?? '';
  expect(text).toContain(['Project outline JSON:', '{}'].join('\n'));
  expect(text).toContain(['Selected slide code JSON:', '{}'].join('\n'));
  expect(text).toContain(['Tool manifest JSON:', '{}'].join('\n'));
});

it('uses provided v3 optional payload fields before provider egress', async () => {
  const sendResponse = vi.fn();
  const message = {
    ...createMessage(),
    contractVersion: 3 as const,
    projectOutlineJson: '{"outline":true}',
    selectedSlideCodeJson: '{"slide":"one"}',
    toolManifestJson: '{"tools":["title"]}',
  };
  requestMultimodalChatCompletionMock.mockResolvedValue('{"operations":[]}');

  expect(routeScenarioEditorLlmMessage(message, sendResponse, createSender())).toBe(true);
  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith({ operations: [], success: true });
  });

  const request = requestMultimodalChatCompletionMock.mock.calls[0]?.[0] as {
    userContent: Array<{ text?: string; type: string }>;
  };
  const text = request.userContent.find((part) => part.type === 'text')?.text ?? '';
  expect(text).toContain('"outline":true');
  expect(text).toContain('"slide":"one"');
  expect(text).toContain('"tools":["title"]');
});
