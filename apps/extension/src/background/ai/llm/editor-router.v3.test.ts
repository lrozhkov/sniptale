import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { routeScenarioEditorLlmMessage } from './editor-router';

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

beforeEach(() => {
  vi.clearAllMocks();
  hasPreauthorizedScenarioEditorLlmRouteMessageMock.mockReturnValue(true);
  extractJSONMock.mockImplementation((value: string) => value);
  initializeAiStorageAccessMock.mockResolvedValue(undefined);
  loadDefaultModelIdMock.mockResolvedValue('model-1');
  loadScenarioEditorSystemPromptMock.mockResolvedValue('Scenario editor system prompt');
  resolveModelConfigMock.mockResolvedValue({
    apiKey: 'secret-key',
    baseUrl: 'https://api.openai.com/v1',
    modelCode: 'gpt-4.1',
    providerId: 'provider-1',
  });
});

function createSender(): chrome.runtime.MessageSender {
  return { url: 'chrome-extension://test/apps/extension/src/scenario-editor/index.html' };
}

it('routes v3 scenario editor requests through operation payloads', async () => {
  const sendResponse = vi.fn();
  requestMultimodalChatCompletionMock.mockResolvedValue(
    '{"operations":[{"slideId":"slide-1","title":"AI title","type":"setSlideTitle"}]}'
  );

  expect(routeScenarioEditorLlmMessage(createV3Message(), sendResponse, createSender())).toBe(true);

  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        operations: [{ slideId: 'slide-1', title: 'AI title', type: 'setSlideTitle' }],
        success: true,
      })
    );
  });
  expect(requestMultimodalChatCompletionMock).toHaveBeenCalledWith(
    expect.objectContaining({
      userContent: [
        expect.objectContaining({
          text: expect.stringContaining('Return ONLY strict JSON with the shape {"operations"'),
        }),
      ],
    })
  );
});

it('rejects invalid v3 operation responses without falling back to step patches', async () => {
  const sendResponse = vi.fn();
  requestMultimodalChatCompletionMock.mockResolvedValue('{"steps":[{"stepId":"step-1"}]}');

  expect(routeScenarioEditorLlmMessage(createV3Message(), sendResponse, createSender())).toBe(true);

  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith({
      error: expect.any(String),
      success: false,
    });
  });
});

it('surfaces malformed v3 JSON responses as parse failures', async () => {
  const sendResponse = vi.fn();
  requestMultimodalChatCompletionMock.mockResolvedValue('not-json');

  expect(routeScenarioEditorLlmMessage(createV3Message(), sendResponse, createSender())).toBe(true);

  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith({
      error: expect.any(String),
      success: false,
    });
  });
});

it('fills missing optional v3 prompt sections with empty objects', async () => {
  const sendResponse = vi.fn();
  requestMultimodalChatCompletionMock.mockResolvedValue('{"operations":[]}');

  expect(
    routeScenarioEditorLlmMessage(
      {
        ...createV3Message(),
        projectOutlineJson: undefined,
        selectedSlideCodeJson: undefined,
        toolManifestJson: undefined,
      },
      sendResponse,
      createSender()
    )
  ).toBe(true);

  await vi.waitFor(() => {
    expect(requestMultimodalChatCompletionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userContent: [
          expect.objectContaining({
            text: expect.stringContaining('Project outline JSON:\n{}'),
          }),
        ],
      })
    );
  });
});

it('redacts sensitive v3 prompt sections before provider egress', async () => {
  const sendResponse = vi.fn();
  requestMultimodalChatCompletionMock.mockResolvedValue('{"operations":[]}');

  expect(
    routeScenarioEditorLlmMessage(
      {
        ...createV3Message(),
        instruction: 'Use Authorization: Basic v3-secret',
        projectOutlineJson: '{"csrf":"csrf-secret"}',
        projectSnapshotJson: '{"sessionId":"session-secret","safe":"Display name"}',
        selectedSlideCodeJson: '{"apiKey":"api-secret"}',
        toolManifestJson: '{"token":"tool-secret"}',
      },
      sendResponse,
      createSender()
    )
  ).toBe(true);

  await vi.waitFor(() => {
    expect(requestMultimodalChatCompletionMock).toHaveBeenCalled();
  });
  const request = requestMultimodalChatCompletionMock.mock.calls[0]?.[0] as
    | { userContent?: Array<{ text?: string; type: string }> }
    | undefined;
  const text = request?.userContent?.find((part) => part.type === 'text')?.text ?? '';
  expect(text).not.toContain('v3-secret');
  expect(text).not.toContain('csrf-secret');
  expect(text).not.toContain('session-secret');
  expect(text).not.toContain('api-secret');
  expect(text).not.toContain('tool-secret');
  expect(text).toContain('Display name');
});

it('rejects non-v3 scenario requests at the contract boundary', async () => {
  const sendResponse = vi.fn();

  expect(
    routeScenarioEditorLlmMessage(
      {
        attachments: [],
        contractVersion: 2,
        instruction: 'Update legacy step',
        llmSessionToken: 'llm-token-1',
        projectSnapshotJson: '{"steps":[]}',
        type: MessageType.PROCESS_SCENARIO_EDITOR_WITH_LLM,
      },
      sendResponse,
      createSender()
    )
  ).toBe(false);
  expect(requestMultimodalChatCompletionMock).not.toHaveBeenCalled();
  expect(sendResponse).not.toHaveBeenCalled();
});

it('ignores messages outside the scenario editor LLM route', () => {
  expect(routeScenarioEditorLlmMessage({ type: 'unknown' }, vi.fn(), createSender())).toBe(false);
});

function createV3Message() {
  return {
    attachments: [],
    contractVersion: 3,
    instruction: 'Edit slide',
    llmSessionToken: 'llm-token-1',
    projectOutlineJson: '{"slides":[]}',
    projectSnapshotJson: '{"outline":{"version":3}}',
    selectedSlideCodeJson: '{"id":"slide-1"}',
    toolManifestJson: '{"operations":["setSlideTitle"]}',
    type: MessageType.PROCESS_SCENARIO_EDITOR_WITH_LLM,
  } as const;
}
