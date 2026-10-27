import { APICallError, type ProviderV4 } from '@ai-sdk/provider';
import type { AIConnectionReason } from '../../contracts/settings/ai-catalog';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createXai } from '@ai-sdk/xai';
import { createZai } from '@ai-sdk/zai';
import { createMoonshotAI } from '@ai-sdk/moonshotai';
import { createAlibaba } from '@ai-sdk/alibaba';
import { createMistral } from '@ai-sdk/mistral';
import { createMiniMax } from '@ai-sdk/minimax';
import { createCohere } from '@ai-sdk/cohere';
import { createElevenLabs } from '@ai-sdk/elevenlabs';
import { createDeepgram } from '@ai-sdk/deepgram';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createOllama } from 'ollama-ai-provider-v2';
import { getAIProviderOperations, type AIProviderType } from '../../contracts/settings/ai-provider';

interface AIProviderRuntimeOptions {
  type: AIProviderType;
  baseUrl: string;
  apiKey: string;
  fetch: typeof globalThis.fetch;
  operation: 'text' | 'transcription' | 'speech';
  compatibleChat?: {
    supportsStructuredOutputs: boolean;
    transformRequestBody?: (body: Record<string, unknown>) => Record<string, unknown>;
  };
}

/** Composes ready-made packages. Callers must supply the authorized, bounded network transport. */
export function createAIProviderRuntime(options: AIProviderRuntimeOptions): ProviderV4 {
  if (
    options.type !== 'chrome-built-in' &&
    options.type !== 'gigachat' &&
    !getAIProviderOperations(options.type).includes(options.operation)
  )
    throw new AIProviderRequestError('provider-unavailable');
  const settings = { apiKey: options.apiKey, baseURL: options.baseUrl, fetch: options.fetch };
  switch (options.type) {
    case 'openai':
      return createOpenAI(settings);
    case 'anthropic':
      return createAnthropic(settings);
    case 'google':
      return createGoogle(settings);
    case 'deepseek':
      return createDeepSeek(settings);
    case 'xai':
      return createXai(settings);
    case 'zai':
      return createZai(settings);
    case 'moonshotai':
      return createMoonshotAI(settings);
    case 'alibaba':
      return createAlibaba(settings);
    case 'mistral':
      return createMistral(settings);
    case 'minimax':
      return createMiniMax(settings);
    case 'cohere':
      return createCohere(settings);
    case 'openrouter':
      return createOpenRouter(settings);
    case 'elevenlabs':
      return createElevenLabs(settings);
    case 'deepgram':
      return createDeepgram(settings);
    case 'ollama':
      return createOllama({ baseURL: options.baseUrl, fetch: options.fetch });
    case 'openai-compatible':
    case 'lm-studio':
    case 'yandex':
    case 'neuraldeep':
      return options.operation === 'text'
        ? createOpenAICompatible({ ...settings, name: options.type, ...options.compatibleChat })
        : createOpenAI(settings);
    case 'chrome-built-in':
    case 'gigachat':
      throw new Error('provider-runtime-unavailable');
  }
}

/** A safe product error. It deliberately excludes SDK response bodies, request payloads, headers, and causes. */
export class AIProviderRequestError extends Error {
  constructor(
    readonly reason: AIConnectionReason,
    message: string = reason
  ) {
    super(message);
    this.name = 'AIProviderRequestError';
  }
}

/** Interprets documented transport evidence without treating HTTP status as retirement proof. */
export function classifyAIProviderFailure(error: unknown): AIConnectionReason {
  if (error instanceof AIProviderRequestError) return error.reason;
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 401) return 'invalid-credential';
    if (error.statusCode === 403) return 'permission-denied';
    if (error.statusCode === 402) return 'quota-exceeded';
    if (error.statusCode === 404) return 'model-unavailable';
    if (error.statusCode === 429) return 'rate-limited';
    if ((error.statusCode ?? 0) >= 500) return 'service-error';
  }
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'))
    return 'timeout';
  if (error instanceof TypeError) return 'network';
  return 'unknown';
}
