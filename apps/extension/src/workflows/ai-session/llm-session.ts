import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { LlmSessionPurpose } from '../../contracts/messaging/llm';
import type { AiEgressAuthority } from '../../contracts/ai/egress-authority';
import { sendRuntimeMessage } from '../../platform/runtime-messaging/index';
import { requestAISecretUnlock } from './secret-unlock-session';

async function requestLlmSessionTokenOnce(
  purpose: LlmSessionPurpose,
  egressAuthority: AiEgressAuthority
) {
  if (egressAuthority.purpose !== purpose) {
    throw new Error('LLM egress authority purpose mismatch');
  }

  const response = await sendRuntimeMessage({
    egressAuthority,
    purpose,
    type: MessageType.REQUEST_LLM_SESSION,
  });

  return response;
}

export async function requestLlmSessionToken(
  purpose: LlmSessionPurpose,
  egressAuthority: AiEgressAuthority
): Promise<string> {
  const response = await requestLlmSessionTokenOnce(purpose, egressAuthority);

  if (!response.success || !response.token) {
    if (response.reason === 'ai-secrets-locked') {
      await requestAISecretUnlock(purpose);
      const retryResponse = await requestLlmSessionTokenOnce(purpose, egressAuthority);
      if (retryResponse.success && retryResponse.token) {
        return retryResponse.token;
      }

      throw new Error(retryResponse.error ?? 'Unable to start AI request session after unlock');
    }

    throw new Error(response.error ?? 'Unable to start AI request session');
  }

  return response.token;
}
