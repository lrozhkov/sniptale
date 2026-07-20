import type { LLMRequestOptimized } from '../../../contracts/messaging/llm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedLlmModelConfig } from './model-config';

const { loggerDebugMock, processJsonConfigRequestMock, processMarkdownRequestMock } = vi.hoisted(
  () => ({
    loggerDebugMock: vi.fn(),
    processJsonConfigRequestMock: vi.fn(),
    processMarkdownRequestMock: vi.fn(),
  })
);

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    child: vi.fn(),
    debug: loggerDebugMock,
    error: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('./transport', () => ({
  processJsonConfigRequest: processJsonConfigRequestMock,
  processMarkdownRequest: processMarkdownRequestMock,
}));

import {
  estimateRequestTokens,
  processWithLLM,
  processWithLLMConfig,
  processWithLLMJSON,
} from './service';

function createConfig(): ResolvedLlmModelConfig {
  return {
    providerId: 'provider-1',
    modelId: 'model-1',
    baseUrl: 'http://127.0.0.1:11434/v1',
    apiKey: 'secret-key',
    modelCode: 'llama3.2',
    effectiveSystemPrompt: 'Return valid JSON only',
  };
}

function resetLlmServiceMocks() {
  vi.clearAllMocks();
  processMarkdownRequestMock.mockResolvedValue({
    cleanedResponse: '| cleaned |',
    data: [],
  });
  processJsonConfigRequestMock.mockResolvedValue({
    cleanedResponse: '{"ok":true}',
    data: [],
  });
}

async function verifyMarkdownDelegation() {
  const request: LLMRequestOptimized = {
    prompt: 'Summarize the content',
    markdownData: '| a |\n| - |',
  };
  const config = createConfig();

  const result = await processWithLLM(request, config);

  expect(processMarkdownRequestMock).toHaveBeenCalledWith(request, config);
  expect(processJsonConfigRequestMock).not.toHaveBeenCalled();
  expect(result).toEqual({
    cleanedResponse: '| cleaned |',
    data: [],
  });
}

async function verifyJsonDelegationWithRetryControl() {
  const request: LLMRequestOptimized = {
    prompt: 'Return normalized JSON',
    jsonData: '{"fields":[]}',
  };
  const config = createConfig();

  await processWithLLMJSON(request, config);
  const configResult = await processWithLLMConfig(request, config, 5);

  expect(processJsonConfigRequestMock).toHaveBeenNthCalledWith(1, request, config, 3);
  expect(processJsonConfigRequestMock).toHaveBeenNthCalledWith(2, request, config, 5);
  expect(processMarkdownRequestMock).not.toHaveBeenCalled();
  expect(configResult).toEqual({
    cleanedResponse: '{"ok":true}',
    data: [],
  });
}

function verifyTokenEstimation() {
  const request: LLMRequestOptimized = {
    prompt: 'Return normalized config',
    markdownData: 'abcd',
    jsonData: '12345678',
  };

  expect(estimateRequestTokens(request)).toBe(209);
  expect(loggerDebugMock).toHaveBeenCalledWith('Token estimate computed', {
    system: 200,
    instruction: 6,
    data: 3,
    total: 209,
  });
}

function verifyTokenEstimationWithoutPayloadData() {
  const request: LLMRequestOptimized = {
    prompt: 'Trim',
  };

  expect(estimateRequestTokens(request)).toBe(201);
  expect(loggerDebugMock).toHaveBeenCalledWith('Token estimate computed', {
    system: 200,
    instruction: 1,
    data: 0,
    total: 201,
  });
}

describe('service', () => {
  beforeEach(resetLlmServiceMocks);

  it('delegates markdown requests to the markdown transport', verifyMarkdownDelegation);
  it(
    'delegates JSON requests to the config transport with the expected retry count',
    verifyJsonDelegationWithRetryControl
  );
  it('estimates request tokens from prompt and payload lengths', verifyTokenEstimation);
  it(
    'treats missing payload data as empty when estimating tokens',
    verifyTokenEstimationWithoutPayloadData
  );
});
