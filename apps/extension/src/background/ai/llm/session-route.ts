import type {
  RequestLlmSessionMessage,
  RequestLlmSessionResponse,
} from '../../../contracts/messaging/llm';
import { requestLlmSessionMessageSchema } from '../../../contracts/messaging/contracts/llm-schemas';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { createLogger } from '@sniptale/platform/observability/logger';
import { issueLlmSessionToken } from './session-tokens';
import { loadAISecretProtectionStatus } from '../../../composition/persistence/ai-settings';
import * as llmPreauthorization from './authorization/preauthorization';

const logger = createLogger({ namespace: 'BackgroundLlmSessionRoute' });

function isRequestLlmSessionMessage(message: unknown): message is RequestLlmSessionMessage {
  return requestLlmSessionMessageSchema.safeParse(message).success;
}

async function resolveLlmSessionResponse(
  message: RequestLlmSessionMessage,
  sender: chrome.runtime.MessageSender
): Promise<RequestLlmSessionResponse> {
  if (!llmPreauthorization.hasPreauthorizedLlmSessionRequestMessage(message)) {
    logger.warn('Rejected LLM session request from unauthorized sender', {
      purpose: message.purpose,
      senderUrl: sender.url,
      tabId: sender.tab?.id,
    });
    return { success: false, error: 'Unauthorized LLM session sender' };
  }

  const protectionStatus = await loadAISecretProtectionStatus();
  if (protectionStatus.isEnabled && !protectionStatus.isUnlocked) {
    return {
      success: false,
      reason: 'ai-secrets-locked',
      error: 'AI provider secrets are locked',
    };
  }

  const token = issueLlmSessionToken({
    egressAuthority: message.egressAuthority,
    purpose: message.purpose,
    sender,
  });
  if (!token) {
    return { success: false, error: 'Unable to issue LLM session token' };
  }
  return { success: true, token };
}

export function routeLlmSessionMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: ResponseSender<RequestLlmSessionResponse>
): boolean {
  if (!isRequestLlmSessionMessage(message)) {
    return false;
  }

  resolveLlmSessionResponse(message, sender).then(sendResponse, (error) => {
    logger.error('LLM session request failed', error);
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : 'LLM session request failed',
    });
  });
  return true;
}
