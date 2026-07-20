import type { LLMRequestOptimized } from '../../../contracts/messaging/llm';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ResolvedLlmModelConfig } from './model-config';

const {
  estimateRequestTokensMock,
  processWithLLMMock,
  processWithLLMConfigMock,
  processWithLLMJSONMock,
  saveRequestHistoryMock,
} = vi.hoisted(() => ({
  estimateRequestTokensMock: vi.fn(),
  processWithLLMMock: vi.fn(),
  processWithLLMConfigMock: vi.fn(),
  processWithLLMJSONMock: vi.fn(),
  saveRequestHistoryMock: vi.fn(),
}));

vi.mock('./service-dispatch', () => ({
  processWithLLM: processWithLLMMock,
  processWithLLMConfig: processWithLLMConfigMock,
  processWithLLMJSON: processWithLLMJSONMock,
}));

vi.mock('./service-tokens', () => ({
  estimateRequestTokens: estimateRequestTokensMock,
}));

vi.mock('./service-history', (_importOriginal) => ({
  saveRequestHistory: saveRequestHistoryMock,
}));

import {
  estimateRequestTokens,
  processWithLLM,
  processWithLLMConfig,
  processWithLLMJSON,
  saveRequestHistory,
} from './service';

const config: ResolvedLlmModelConfig = {
  providerId: 'provider-1',
  modelId: 'model-1',
  baseUrl: 'http://127.0.0.1:11434/v1',
  apiKey: 'secret-key',
  modelCode: 'llama3.2',
  effectiveSystemPrompt: 'Return valid JSON only',
};

const request: LLMRequestOptimized = {
  prompt: 'Summarize the content',
  markdownData: '| a |',
};

beforeEach(() => {
  vi.clearAllMocks();
});

it('re-exports service helpers through the thin facade', async () => {
  processWithLLMMock.mockResolvedValue({ cleanedResponse: 'm', data: [] });
  processWithLLMJSONMock.mockResolvedValue({ cleanedResponse: 'j', data: [] });
  processWithLLMConfigMock.mockResolvedValue({ cleanedResponse: 'c', data: [] });
  estimateRequestTokensMock.mockReturnValue(201);

  await expect(processWithLLM(request, config)).resolves.toEqual({
    cleanedResponse: 'm',
    data: [],
  });
  await expect(processWithLLMJSON(request, config)).resolves.toEqual({
    cleanedResponse: 'j',
    data: [],
  });
  await expect(processWithLLMConfig(request, config, 5)).resolves.toEqual({
    cleanedResponse: 'c',
    data: [],
  });
  expect(estimateRequestTokens(request)).toBe(201);
  expect(saveRequestHistory).toBe(saveRequestHistoryMock);
});
