import type { LLMRequestOptimized, LLMResponse } from '../../../../contracts/messaging/llm';
import { translate } from '../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { parseLlmJsonResponse } from '../../../../features/ai/schemas/ai-response';
import {
  extractJSON,
  extractMarkdownTables,
  requestChatCompletion as requestChatCompletionTransport,
} from './request';
import { SYSTEM_PROMPT_JSON, SYSTEM_PROMPT_TABLES } from './prompts';
import type { ResolvedLlmModelConfig } from '../model-config';

type TransportRequestSettings = {
  baseUrl: string;
  apiKey: string;
  modelCode: string;
};

type JsonRetryOptions = {
  execute: (systemPrompt: string, userPrompt: string) => Promise<string>;
  getSystemPrompt: (attempt: number) => string;
  maxRetries: number;
};

const logger = createLogger({ namespace: 'BackgroundLlmTransport' });
const BASE_LLM_RETRY_DELAY_MS = 1_000;
const MAX_LLM_RETRY_DELAY_MS = 8_000;

class LlmJsonValidationError extends Error {}

function getSystemPrompt(): string {
  return SYSTEM_PROMPT_TABLES;
}

function buildUserPromptJSON(jsonData: string, userInstruction: string): string {
  return `${jsonData}\n\n### Instruction:\n${userInstruction}`;
}

function buildUserPrompt(markdownData: string, userInstruction: string): string {
  return `${markdownData}\n\n### Instruction:\n${userInstruction}`;
}

async function requestConfigChatCompletion(
  settings: TransportRequestSettings,
  systemPrompt: string,
  userPrompt: string,
  providerErrorLabel: string
): Promise<string> {
  return requestChatCompletionTransport({
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
    modelCode: settings.modelCode,
    systemPrompt,
    userPrompt,
    providerErrorLabel,
  });
}

async function processJsonRequestWithRetry(
  request: LLMRequestOptimized,
  options: JsonRetryOptions
): Promise<LLMResponse> {
  logger.debug('Processing JSON request with retry', { maxRetries: options.maxRetries });

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
    try {
      return await executeJsonRequestAttempt(request, options, attempt);
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error(translate('content.runtime.unknownError'));

      if (!(error instanceof LlmJsonValidationError)) {
        logger.warn('LLM attempt failed', { attempt, error });
      }

      if (attempt === options.maxRetries) {
        throw lastError;
      }

      if (error instanceof LlmJsonValidationError) {
        continue;
      }

      await waitForRetryBackoff(attempt);
    }
  }

  throw lastError || new Error(translate('background.runtime.llmValidResponseFailed'));
}

async function executeJsonRequestAttempt(
  request: LLMRequestOptimized,
  options: JsonRetryOptions,
  attempt: number
): Promise<LLMResponse> {
  logger.debug('LLM attempt started', { attempt, maxRetries: options.maxRetries });
  const userPrompt = buildUserPromptJSON(request.jsonData || '', request.prompt);
  logger.debug('Prepared JSON prompt payload', {
    jsonLength: (request.jsonData || '').length,
    userPromptLength: userPrompt.length,
  });

  const content = await options.execute(options.getSystemPrompt(attempt), userPrompt);
  const cleanedResponse = extractJSON(content);
  assertValidJsonResponse(cleanedResponse, attempt);
  logger.debug('LLM JSON response validated', { attempt });
  return { cleanedResponse, data: [] };
}

function assertValidJsonResponse(cleanedResponse: string, attempt: number): void {
  const validation = parseLlmJsonResponse(cleanedResponse);

  if (!validation.success) {
    logger.warn('LLM JSON validation failed', {
      attempt,
      error: validation.error,
    });
    throw new LlmJsonValidationError(
      validation.error || translate('background.runtime.llmValidationError')
    );
  }
}

function resolveRetryDelayMs(attempt: number): number {
  const boundedDelay = Math.min(
    BASE_LLM_RETRY_DELAY_MS * 2 ** Math.max(attempt - 1, 0),
    MAX_LLM_RETRY_DELAY_MS
  );
  const jitter = Math.floor(boundedDelay * 0.2);
  return boundedDelay + jitter;
}

function waitForRetryBackoff(attempt: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, resolveRetryDelayMs(attempt));
  });
}

export async function processMarkdownRequest(
  request: LLMRequestOptimized,
  config: ResolvedLlmModelConfig
): Promise<LLMResponse> {
  const systemPrompt = getSystemPrompt();
  const userPrompt = buildUserPrompt(request.markdownData || '', request.prompt);
  logger.debug('Processing markdown LLM request', {
    markdownLength: (request.markdownData || '').length,
    modelCode: config.modelCode,
    userPromptLength: userPrompt.length,
    providerId: config.providerId,
  });

  try {
    const content = await requestConfigChatCompletion(
      {
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        modelCode: config.modelCode,
      },
      systemPrompt,
      userPrompt,
      translate('background.runtime.llmInvalidProviderApiKey')
    );
    const cleanedResponse = extractMarkdownTables(content);
    return {
      cleanedResponse,
      data: [],
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Unable to parse')) {
        throw error;
      }
      throw error;
    }

    logger.error('Unexpected non-Error value while processing markdown request', error);
    throw new Error(translate('background.runtime.llmUnexpectedProcessingError'));
  }
}

export async function processJsonConfigRequest(
  request: LLMRequestOptimized,
  config: ResolvedLlmModelConfig,
  maxRetries = 3
): Promise<LLMResponse> {
  logger.debug('Processing JSON request with provider config', {
    baseUrl: config.baseUrl,
    modelCode: config.modelCode,
    providerId: config.providerId,
  });

  return processJsonRequestWithRetry(request, {
    maxRetries,
    getSystemPrompt: (attempt) => {
      let systemPrompt = config.effectiveSystemPrompt || SYSTEM_PROMPT_JSON;
      if (attempt > 1) {
        systemPrompt += `\n\n${translate('background.runtime.llmRetryInstruction')}`;
      }
      return systemPrompt;
    },
    execute: (systemPrompt, userPrompt) =>
      requestConfigChatCompletion(
        {
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          modelCode: config.modelCode,
        },
        systemPrompt,
        userPrompt,
        translate('background.runtime.llmInvalidProviderApiKey')
      ),
  });
}
