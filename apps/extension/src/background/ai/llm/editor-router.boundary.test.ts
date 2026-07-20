import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const {
  hasPreauthorizedScenarioEditorLlmRouteMessageMock,
  requestMultimodalChatCompletionMock,
  resolveModelConfigMock,
} = vi.hoisted(() => ({
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

  initializeAiStorageAccess: vi.fn(),
  loadDefaultModelId: vi.fn(),
  loadScenarioEditorSystemPrompt: vi.fn(),
}));

vi.mock('./model-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./model-config')>()),
  resolveModelConfig: resolveModelConfigMock,
}));

vi.mock('./transport/request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./transport/request')>()),
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
    modelId: null,
    projectSnapshotJson: '{"steps":[]}',
    type: MessageType.PROCESS_SCENARIO_EDITOR_WITH_LLM,
  } as const;
}

function createSender(): chrome.runtime.MessageSender {
  return { url: 'chrome-extension://test/apps/extension/src/scenario-editor/index.html' };
}

beforeEach(() => {
  vi.clearAllMocks();
  hasPreauthorizedScenarioEditorLlmRouteMessageMock.mockReturnValue(true);
});

it('returns false for unrelated or malformed scenario editor LLM messages', () => {
  const sendResponse = vi.fn();

  expect(
    routeScenarioEditorLlmMessage(
      { type: MessageType.PROCESS_WITH_LLM },
      sendResponse,
      createSender()
    )
  ).toBe(false);
  expect(
    routeScenarioEditorLlmMessage(
      { ...createMessage(), attachments: [{ dataUrl: 'not-a-data-url' }] },
      sendResponse,
      createSender()
    )
  ).toBe(false);
  expect(routeScenarioEditorLlmMessage('not-an-object', sendResponse, createSender())).toBe(false);
  expect(sendResponse).not.toHaveBeenCalled();
});

it('rejects unauthorized tokens before resolving model config', () => {
  const sendResponse = vi.fn();
  hasPreauthorizedScenarioEditorLlmRouteMessageMock.mockReturnValueOnce(false);

  expect(routeScenarioEditorLlmMessage(createMessage(), sendResponse, createSender())).toBe(true);

  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'Unauthorized LLM request',
  });
  expect(resolveModelConfigMock).not.toHaveBeenCalled();
  expect(requestMultimodalChatCompletionMock).not.toHaveBeenCalled();
});

it('does not claim oversized scenario payloads after schema boundary rejection', () => {
  const sendResponse = vi.fn();

  expect(
    routeScenarioEditorLlmMessage(
      {
        ...createMessage(),
        instruction: 'x'.repeat(16_001),
      },
      sendResponse,
      createSender()
    )
  ).toBe(false);

  expect(sendResponse).not.toHaveBeenCalled();
  expect(resolveModelConfigMock).not.toHaveBeenCalled();
  expect(requestMultimodalChatCompletionMock).not.toHaveBeenCalled();
});
