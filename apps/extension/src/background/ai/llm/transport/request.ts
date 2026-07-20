import { resolveAIProviderChatCompletionsUrl } from '@sniptale/runtime-contracts/ai/provider-base-url-policy';
import { translate } from '../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { postJsonWithTimeout } from './http';

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

function buildChatPayload(
  model: string,
  systemPrompt: string,
  userContent: string | ChatCompletionRequestContentPart[]
) {
  const maxTokens = resolveChatCompletionMaxTokens(model);

  return {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.7,
    max_tokens: maxTokens,
  };
}

function resolveChatCompletionMaxTokens(modelCode: string): number {
  const normalizedModelCode = modelCode.toLowerCase();

  if (normalizedModelCode.includes('gpt-5') || normalizedModelCode.includes('o1')) {
    return 8_000;
  }

  if (
    normalizedModelCode.includes('gpt-4') ||
    normalizedModelCode.includes('claude') ||
    normalizedModelCode.includes('gemini')
  ) {
    return 6_000;
  }

  if (
    normalizedModelCode.includes('llama') ||
    normalizedModelCode.includes('mistral') ||
    normalizedModelCode.includes('qwen') ||
    normalizedModelCode.includes('deepseek')
  ) {
    return 4_000;
  }

  return 3_000;
}

function createStatusHandler(providerLabel?: string) {
  return (status: number, _errorData: unknown) => {
    if (status === 401) {
      throw new Error(translate('background.runtime.llmInvalidApiKey'));
    }
    if (status === 429) {
      throw new Error(translate('background.runtime.llmRateLimitExceeded'));
    }
    if (status === 400) {
      const prefix = translate('background.runtime.llmInvalidRequestPrefix');
      const label = providerLabel ? ` (${providerLabel})` : '';
      throw new Error(`${prefix}${label}`);
    }
    if (status === 500) {
      throw new Error(translate('background.runtime.llmServerError'));
    }

    throw new Error(`API error (${status}): Unknown error`);
  };
}

async function sendChatRequest(
  apiUrl: string,
  apiKey: string,
  payload: object,
  handleStatus: (status: number, errorData: unknown) => void
): Promise<string> {
  const response = await postJsonWithTimeout({
    url: apiUrl,
    body: payload,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    timeoutErrorMessage: translate('background.runtime.llmRequestTimeout'),
  });

  logger.debug('Received chat completion response', { apiUrl, status: response.status });

  if (!response.ok) {
    handleStatus(response.status, response.data);
  }

  const content = getChatCompletionContent(response.data);
  if (!content) {
    logger.error('Unexpected response structure from provider');
    throw new Error(translate('background.runtime.llmUnexpectedResponse'));
  }

  logger.debug('Parsed chat completion content', { contentLength: content.length });
  return content;
}

function getChatCompletionContent(result: unknown): string | null {
  if (!isRecord(result)) {
    return null;
  }

  const choice = getFirstArrayItem(result['choices']);
  if (!isRecord(choice) || !isRecord(choice['message'])) {
    return null;
  }

  const content = choice['message']['content'];
  if (typeof content === 'string') {
    return content;
  }

  if (isUnknownArray(content)) {
    const textParts = content.filter(isTextContentPart).map((part) => part.text);

    return textParts.length > 0 ? textParts.join('\n') : null;
  }

  return null;
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function getFirstArrayItem(value: unknown): unknown {
  if (!isUnknownArray(value)) {
    return null;
  }

  return value[0] ?? null;
}

function isTextContentPart(value: unknown): value is { text: string } {
  return isRecord(value) && typeof value['text'] === 'string';
}

function buildChatCompletionsUrl(baseUrl: string): string {
  const apiUrl = resolveAIProviderChatCompletionsUrl(baseUrl);
  if (!apiUrl) {
    throw new Error(translate('background.runtime.llmProviderBaseUrlHttpsRequired'));
  }

  return apiUrl;
}

export async function requestChatCompletion(options: {
  baseUrl: string;
  apiKey: string;
  modelCode: string;
  systemPrompt: string;
  userPrompt: string;
  providerErrorLabel?: string;
}): Promise<string> {
  const apiUrl = buildChatCompletionsUrl(options.baseUrl);
  const payload = buildChatPayload(options.modelCode, options.systemPrompt, options.userPrompt);

  return sendChatRequest(
    apiUrl,
    options.apiKey,
    payload,
    createStatusHandler(options.providerErrorLabel)
  );
}

export async function requestMultimodalChatCompletion(options: {
  baseUrl: string;
  apiKey: string;
  modelCode: string;
  providerErrorLabel?: string;
  systemPrompt: string;
  userContent: ChatCompletionRequestContentPart[];
}): Promise<string> {
  const apiUrl = buildChatCompletionsUrl(options.baseUrl);
  const payload = buildChatPayload(options.modelCode, options.systemPrompt, options.userContent);

  return sendChatRequest(
    apiUrl,
    options.apiKey,
    payload,
    createStatusHandler(options.providerErrorLabel)
  );
}
