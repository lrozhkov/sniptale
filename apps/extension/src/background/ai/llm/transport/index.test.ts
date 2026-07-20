import { translate } from '../../../../platform/i18n';
import type { LLMRequestOptimized } from '../../../../contracts/messaging/llm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_PROMPT_JSON, SYSTEM_PROMPT_TABLES } from './prompts';
import type { ResolvedLlmModelConfig } from '../model-config';

const {
  extractJSONMock,
  extractMarkdownTablesMock,
  loggerDebugMock,
  loggerErrorMock,
  loggerWarnMock,
  parseLlmJsonResponseMock,
  requestChatCompletionMock,
} = vi.hoisted(() => ({
  extractJSONMock: vi.fn(),
  extractMarkdownTablesMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  parseLlmJsonResponseMock: vi.fn(),
  requestChatCompletionMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', (_importOriginal) => ({
  createLogger: () => ({
    child: vi.fn(),
    debug: loggerDebugMock,
    error: loggerErrorMock,
    info: vi.fn(),
    log: vi.fn(),
    warn: loggerWarnMock,
  }),
}));

vi.mock('../../../../features/ai/schemas/ai-response', (_importOriginal) => ({
  parseLlmJsonResponse: parseLlmJsonResponseMock,
}));

vi.mock('./request', (_importOriginal) => ({
  extractJSON: extractJSONMock,
  extractMarkdownTables: extractMarkdownTablesMock,
  requestChatCompletion: requestChatCompletionMock,
}));

import { processJsonConfigRequest, processMarkdownRequest } from '.';

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

function createMarkdownRequest(): LLMRequestOptimized {
  return {
    prompt: 'Summarize the table',
    markdownData: '| a |\n| - |',
  };
}

function createJsonRequest(): LLMRequestOptimized {
  return {
    prompt: 'Return normalized config',
    jsonData: '{"fields":[]}',
  };
}

function resetLlmServiceTransportMocks() {
  vi.clearAllMocks();

  extractJSONMock.mockImplementation((value: string) => value);
  extractMarkdownTablesMock.mockImplementation((value: string) => value);
  parseLlmJsonResponseMock.mockReturnValue({
    success: true,
    data: {
      f: [],
      i: 'Return normalized config',
      t: [],
    },
  });
  requestChatCompletionMock.mockResolvedValue('provider-response');
}

async function verifyMarkdownProcessingSuccess() {
  extractMarkdownTablesMock.mockReturnValue('| cleaned |\n| - |');

  const result = await processMarkdownRequest(createMarkdownRequest(), createConfig());

  expect(requestChatCompletionMock).toHaveBeenCalledWith({
    apiKey: 'secret-key',
    baseUrl: 'http://127.0.0.1:11434/v1',
    modelCode: 'llama3.2',
    providerErrorLabel: translate('background.runtime.llmInvalidProviderApiKey'),
    systemPrompt: SYSTEM_PROMPT_TABLES,
    userPrompt: '| a |\n| - |\n\n### Instruction:\nSummarize the table',
  });
  expect(extractMarkdownTablesMock).toHaveBeenCalledWith('provider-response');
  expect(result).toEqual({
    cleanedResponse: '| cleaned |\n| - |',
    data: [],
  });
}

async function verifyMarkdownUnexpectedProcessingError() {
  requestChatCompletionMock.mockRejectedValue('request failed');

  await expect(processMarkdownRequest(createMarkdownRequest(), createConfig())).rejects.toThrow(
    translate('background.runtime.llmUnexpectedProcessingError')
  );

  expect(loggerErrorMock).toHaveBeenCalledWith(
    'Unexpected non-Error value while processing markdown request',
    'request failed'
  );
}

async function verifyMarkdownParseErrorPassthrough() {
  requestChatCompletionMock.mockRejectedValue(new Error('Unable to parse provider payload'));

  await expect(processMarkdownRequest(createMarkdownRequest(), createConfig())).rejects.toThrow(
    'Unable to parse provider payload'
  );
}

async function verifyMarkdownErrorPassthrough() {
  requestChatCompletionMock.mockRejectedValue(new Error('provider failed'));

  await expect(processMarkdownRequest(createMarkdownRequest(), createConfig())).rejects.toThrow(
    'provider failed'
  );
}

async function verifyJsonRetryInstructionFlow() {
  requestChatCompletionMock
    .mockResolvedValueOnce('not-valid-json')
    .mockResolvedValueOnce('{"i":"ok","f":[],"t":[]}');
  parseLlmJsonResponseMock
    .mockReturnValueOnce({
      success: false,
      error: 'Invalid LLM JSON response',
    })
    .mockReturnValueOnce({
      success: true,
      data: {
        f: [],
        i: 'ok',
        t: [],
      },
    });

  const pending = processJsonConfigRequest(createJsonRequest(), createConfig(), 2);
  await vi.runAllTimersAsync();
  const result = await pending;

  expect(requestChatCompletionMock).toHaveBeenCalledTimes(2);
  expect(requestChatCompletionMock).toHaveBeenNthCalledWith(1, {
    apiKey: 'secret-key',
    baseUrl: 'http://127.0.0.1:11434/v1',
    modelCode: 'llama3.2',
    providerErrorLabel: translate('background.runtime.llmInvalidProviderApiKey'),
    systemPrompt: 'Return valid JSON only',
    userPrompt: '{"fields":[]}\n\n### Instruction:\nReturn normalized config',
  });
  expect(requestChatCompletionMock).toHaveBeenNthCalledWith(2, {
    apiKey: 'secret-key',
    baseUrl: 'http://127.0.0.1:11434/v1',
    modelCode: 'llama3.2',
    providerErrorLabel: translate('background.runtime.llmInvalidProviderApiKey'),
    systemPrompt: `Return valid JSON only\n\n${translate('background.runtime.llmRetryInstruction')}`,
    userPrompt: '{"fields":[]}\n\n### Instruction:\nReturn normalized config',
  });
  expect(extractJSONMock).toHaveBeenNthCalledWith(1, 'not-valid-json');
  expect(extractJSONMock).toHaveBeenNthCalledWith(2, '{"i":"ok","f":[],"t":[]}');
  expect(result).toEqual({
    cleanedResponse: '{"i":"ok","f":[],"t":[]}',
    data: [],
  });
}

async function verifyJsonValidationFailureAfterLastRetry() {
  requestChatCompletionMock.mockResolvedValue('still-invalid-json');
  parseLlmJsonResponseMock.mockReturnValue({
    success: false,
    error: 'Schema mismatch',
  });

  const pending = processJsonConfigRequest(
    createJsonRequest(),
    { ...createConfig(), effectiveSystemPrompt: '' },
    2
  );
  const rejection = expect(pending).rejects.toThrow('Schema mismatch');
  await vi.runAllTimersAsync();

  await rejection;

  expect(requestChatCompletionMock).toHaveBeenNthCalledWith(1, {
    apiKey: 'secret-key',
    baseUrl: 'http://127.0.0.1:11434/v1',
    modelCode: 'llama3.2',
    providerErrorLabel: translate('background.runtime.llmInvalidProviderApiKey'),
    systemPrompt: SYSTEM_PROMPT_JSON,
    userPrompt: '{"fields":[]}\n\n### Instruction:\nReturn normalized config',
  });
  expect(requestChatCompletionMock).toHaveBeenNthCalledWith(2, {
    apiKey: 'secret-key',
    baseUrl: 'http://127.0.0.1:11434/v1',
    modelCode: 'llama3.2',
    providerErrorLabel: translate('background.runtime.llmInvalidProviderApiKey'),
    systemPrompt: `${SYSTEM_PROMPT_JSON}\n\n${translate('background.runtime.llmRetryInstruction')}`,
    userPrompt: '{"fields":[]}\n\n### Instruction:\nReturn normalized config',
  });
}

async function verifyJsonUnexpectedErrorNormalization() {
  requestChatCompletionMock.mockRejectedValue('network failed');

  await expect(processJsonConfigRequest(createJsonRequest(), createConfig(), 1)).rejects.toThrow(
    translate('content.runtime.unknownError')
  );
}

describe('transport', () => {
  beforeEach(() => {
    resetLlmServiceTransportMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it(
    'builds the markdown provider request and returns cleaned markdown tables',
    verifyMarkdownProcessingSuccess
  );
  it(
    'maps unexpected non-Error markdown failures to the translated fallback error',
    verifyMarkdownUnexpectedProcessingError
  );
  it(
    'passes through provider parse errors without rewriting them',
    verifyMarkdownParseErrorPassthrough
  );
  it('passes through generic Error markdown failures unchanged', verifyMarkdownErrorPassthrough);
  it(
    'retries invalid JSON responses and appends the retry instruction on the second attempt',
    verifyJsonRetryInstructionFlow
  );
  it(
    'throws the last validation error after the final JSON retry is exhausted',
    verifyJsonValidationFailureAfterLastRetry
  );
  it(
    'normalizes non-Error JSON transport failures into the shared fallback message',
    verifyJsonUnexpectedErrorNormalization
  );
});
