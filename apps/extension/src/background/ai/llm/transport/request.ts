import { generateText, type UserContent } from 'ai';
import { APICallError, InvalidResponseDataError, TypeValidationError } from '@ai-sdk/provider';
import { isAllowedAIProviderBaseUrl } from '@sniptale/runtime-contracts/ai/provider-base-url-policy';
import { translate } from '../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { AIProviderType } from '../../../../contracts/settings/ai-provider';
import {
  AIProviderRequestError,
  classifyAIProviderFailure,
  createAIProviderRuntime,
} from '../../providers';
import { createProviderSdkFetch } from './http';

const logger = createLogger({ namespace: 'BackgroundLlmHttp' });

export type ChatCompletionRequestContentPart =
  | {
      text: string;
      type: 'text';
    }
  | {
      image_url: {
        url: string;
      };
      type: 'image_url';
    };

export function extractMarkdownTables(content: string): string {
  let cleaned = content.trim();
  cleaned = cleaned.replace(/```markdown\n?/gi, '');
  cleaned = cleaned.replace(/```\n?/g, '');

  logger.debug('Extracted markdown tables', {
    rawLength: content.length,
    cleanedLength: cleaned.length,
  });
  return cleaned;
}

export function extractJSON(content: string): string {
  let cleaned = content.trim();
  cleaned = cleaned.replace(/```json\n?/gi, '');
  cleaned = cleaned.replace(/```\n?/g, '');

  logger.debug('Extracted JSON payload', {
    rawLength: content.length,
    cleanedLength: cleaned.length,
  });
  return cleaned;
}

interface ChatRequestOptions {
  baseUrl: string;
  apiKey: string;
  modelCode: string;
  connectionType?: AIProviderType;
  maxOutputTokens?: number;
  systemPrompt: string;
  providerErrorLabel?: string;
  signal?: AbortSignal;
  beforeSend?(): Promise<void>;
  rejectTruncated?: boolean;
}

function safeFailure(error: unknown, options: ChatRequestOptions): never {
  if (options.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  if (error instanceof AIProviderRequestError) throw error;
  if (APICallError.isInstance(error) && error.statusCode === 400) {
    const label = options.providerErrorLabel ? ` (${options.providerErrorLabel})` : '';
    throw new AIProviderRequestError(
      'unknown',
      `${translate('background.runtime.llmInvalidRequestPrefix')}${label}`
    );
  }
  if (
    InvalidResponseDataError.isInstance(error) ||
    TypeValidationError.isInstance(error) ||
    (APICallError.isInstance(error) && error.statusCode === 200)
  ) {
    logger.error('Unexpected response structure from provider');
    throw new AIProviderRequestError(
      'unknown',
      translate('background.runtime.llmUnexpectedResponse')
    );
  }
  const reason = classifyAIProviderFailure(error);
  if (reason === 'invalid-credential')
    throw new AIProviderRequestError(reason, translate('background.runtime.llmInvalidApiKey'));
  if (reason === 'rate-limited')
    throw new AIProviderRequestError(reason, translate('background.runtime.llmRateLimitExceeded'));
  if (reason === 'service-error')
    throw new AIProviderRequestError(reason, translate('background.runtime.llmServerError'));
  if (reason === 'timeout')
    throw new AIProviderRequestError(reason, translate('background.runtime.llmRequestTimeout'));
  if (APICallError.isInstance(error) && error.statusCode !== undefined)
    throw new AIProviderRequestError(reason, `API error (${error.statusCode}): Unknown error`);
  throw new AIProviderRequestError(
    reason,
    translate('background.runtime.llmUnexpectedProcessingError')
  );
}

async function sendChatRequest(options: ChatRequestOptions, content: UserContent): Promise<string> {
  if (!isAllowedAIProviderBaseUrl(options.baseUrl)) {
    throw new Error(translate('background.runtime.llmProviderBaseUrlHttpsRequired'));
  }
  let admissionFailed = false;
  let admissionFailure: unknown;
  try {
    const transport = createProviderSdkFetch({
      baseUrl: options.baseUrl,
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.beforeSend
        ? {
            beforeSend: async () => {
              try {
                await options.beforeSend?.();
              } catch (error) {
                admissionFailed = true;
                admissionFailure = error;
                throw error;
              }
            },
          }
        : {}),
    });
    const provider = createAIProviderRuntime({
      type: options.connectionType ?? 'openai-compatible',
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      fetch: transport,
      operation: 'text',
    });
    const result = await generateText({
      model: provider.languageModel(options.modelCode),
      instructions: options.systemPrompt,
      messages: [{ role: 'user', content }],
      maxOutputTokens: options.maxOutputTokens ?? 3000,
      maxRetries: 0,
      timeout: 30000,
      ...(options.signal ? { abortSignal: options.signal } : {}),
      experimental_download: async (requests) => {
        if (requests.length) throw new Error('provider-download-refused');
        return [];
      },
    });
    if (
      options.rejectTruncated &&
      (result.finalStep.finishReason === 'length' ||
        result.finalStep.finishReason === 'content-filter')
    ) {
      throw new AIProviderRequestError(
        'unknown',
        translate('background.runtime.llmUnexpectedResponse')
      );
    }
    const text = result.text;
    if (!text)
      throw new AIProviderRequestError(
        'unknown',
        translate('background.runtime.llmUnexpectedResponse')
      );
    logger.debug('Parsed chat completion content', { contentLength: text.length });
    return text;
  } catch (error) {
    if (admissionFailed) throw admissionFailure;
    return safeFailure(error, options);
  }
}

/** Runs one admitted SDK request. The application owns retries and proposal acceptance. */
export function requestChatCompletion(
  options: ChatRequestOptions & { userPrompt: string }
): Promise<string> {
  return sendChatRequest(options, options.userPrompt);
}

export function requestMultimodalChatCompletion(
  options: ChatRequestOptions & { userContent: ChatCompletionRequestContentPart[] }
): Promise<string> {
  const content: UserContent = options.userContent.map((part) => {
    if (part.type === 'text') return part;
    if (!part.image_url.url.startsWith('data:image/'))
      throw new AIProviderRequestError('unknown', 'unsupported-image-source');
    return {
      type: 'file',
      data: part.image_url.url,
      mediaType: part.image_url.url.slice(5, part.image_url.url.indexOf(';')),
    };
  });
  return sendChatRequest(options, content);
}
