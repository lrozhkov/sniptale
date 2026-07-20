import type { LLMRequestOptimized, LLMResponse } from '../../../contracts/messaging/llm';
import type { ResolvedLlmModelConfig } from './model-config';
import { processJsonConfigRequest, processMarkdownRequest } from './transport';

export async function processWithLLM(
  request: LLMRequestOptimized,
  config: ResolvedLlmModelConfig
): Promise<LLMResponse> {
  return processMarkdownRequest(request, config);
}

export async function processWithLLMJSON(
  request: LLMRequestOptimized,
  config: ResolvedLlmModelConfig,
  maxRetries: number = 3
): Promise<LLMResponse> {
  return processJsonConfigRequest(request, config, maxRetries);
}

export async function processWithLLMConfig(
  request: LLMRequestOptimized,
  config: ResolvedLlmModelConfig,
  maxRetries: number = 3
): Promise<LLMResponse> {
  return processWithLLMJSON(request, config, maxRetries);
}
