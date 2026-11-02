import type { SecretProtectionPort } from '../../../composition/persistence/secret-protection/model';
import type { LLMRequestOptimized, LLMResponse } from '../../../contracts/messaging/llm';
import type { ResolvedLlmModelConfig } from './model-config';
import { processJsonConfigRequest, processMarkdownRequest } from './transport';

export async function processWithLLM(
  request: LLMRequestOptimized,
  config: ResolvedLlmModelConfig,
  protection?: SecretProtectionPort
): Promise<LLMResponse> {
  return processMarkdownRequest(request, config, protection);
}

export async function processWithLLMJSON(
  request: LLMRequestOptimized,
  config: ResolvedLlmModelConfig,
  maxRetries: number = 3,
  protection?: SecretProtectionPort
): Promise<LLMResponse> {
  return processJsonConfigRequest(request, config, maxRetries, protection);
}

export async function processWithLLMConfig(
  request: LLMRequestOptimized,
  config: ResolvedLlmModelConfig,
  maxRetries: number = 3,
  protection?: SecretProtectionPort
): Promise<LLMResponse> {
  return processWithLLMJSON(request, config, maxRetries, protection);
}
