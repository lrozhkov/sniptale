import type {
  ProcessWithLLMMessage,
  ProcessWithLLMResponse,
} from '../../../contracts/messaging/llm';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import type { AiPrivacyProof } from '../../../features/ai/privacy';
import { processWithLlmMessageSchema } from '../../../contracts/messaging/contracts/llm-schemas';
import { createLogger } from '@sniptale/platform/observability/logger';
import { saveRequestHistory } from './service';
import { resolveModelConfig } from './model-config';
import { respondAsyncLlmRoute, resolveRequiredLlmModelId } from './route-response';
import { assertProcessWithLlmPayloadLimits } from '../../../contracts/ai/payload-limits';
import {
  createHistoryEntryArgs,
  logLLMRequest,
  resolveFailureHistoryErrorCode,
  resolveRequestKind,
} from './router.helpers';
import { processMultiProviderRequest } from './router-processing';
import { hasPreauthorizedLlmRouteMessage } from './authorization/preauthorization';

const logger = createLogger({ namespace: 'BackgroundLlmRoute' });

async function processWithLLMRequest(message: {
  prompt: string;
  jsonData?: string | undefined;
  markdownData?: string | undefined;
  modelId?: string | null | undefined;
  privacyProof?: AiPrivacyProof | undefined;
}): Promise<ProcessWithLLMResponse> {
  logLLMRequest(message);

  const modelId = await resolveRequiredLlmModelId(message.modelId);
  const config = await resolveModelConfig(modelId);
  return processMultiProviderRequest(message, config);
}

export function routeLlmMessage(
  message: unknown,
  sendResponse: ResponseSender<ProcessWithLLMResponse>,
  sender: chrome.runtime.MessageSender
): boolean {
  if (!isProcessWithLLMMessage(message)) {
    return false;
  }

  const llmMessage = message;
  if (!isAuthorizedLlmRequest(llmMessage, sender)) {
    sendResponse({ success: false, error: 'Unauthorized LLM request' });
    return true;
  }

  const payloadError = getLlmPayloadError(llmMessage);
  if (payloadError) {
    sendResponse({ success: false, error: payloadError });
    return true;
  }

  respondAsyncLlmRoute({
    work: processLlmRequestWithHistory(llmMessage),
    sendResponse,
    logger,
    failureLogMessage: 'LLM route request failed',
  });

  return true;
}

function isProcessWithLLMMessage(message: unknown): message is ProcessWithLLMMessage {
  return processWithLlmMessageSchema.safeParse(message).success;
}

function isAuthorizedLlmRequest(
  message: ProcessWithLLMMessage,
  _sender: chrome.runtime.MessageSender
): boolean {
  return hasPreauthorizedLlmRouteMessage(message);
}

function getLlmPayloadError(message: ProcessWithLLMMessage): string | null {
  try {
    assertProcessWithLlmPayloadLimits(message);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid LLM request payload';
  }
}

function processLlmRequestWithHistory(
  message: ProcessWithLLMMessage
): Promise<ProcessWithLLMResponse> {
  return processWithLLMRequest(message)
    .then((result) => {
      return result;
    })
    .catch((error) => {
      persistFailedLegacyHistory(message, error);
      throw error;
    });
}

function persistFailedLegacyHistory(message: ProcessWithLLMMessage, error: unknown): void {
  void saveRequestHistory(
    createHistoryEntryArgs({
      errorCode: resolveFailureHistoryErrorCode(error),
      modelId: message.modelId,
      requestKind: resolveRequestKind(message),
      resultCount: 0,
      status: 'failure',
    })
  );
}
