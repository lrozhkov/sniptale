import type { LLMRequestOptimized } from '../../../contracts/messaging/llm';
import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'BackgroundLlmService' });

export function estimateRequestTokens(request: LLMRequestOptimized): number {
  const systemPromptTokens = 200;
  const instructionTokens = Math.ceil(request.prompt.length / 4);
  const dataTokens = Math.ceil(
    ((request.markdownData || '') + (request.jsonData || '')).length / 4
  );

  const total = systemPromptTokens + instructionTokens + dataTokens;
  logger.debug('Token estimate computed', {
    system: systemPromptTokens,
    instruction: instructionTokens,
    data: dataTokens,
    total,
  });

  return total;
}
