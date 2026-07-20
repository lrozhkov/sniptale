import type { LlmSessionPurpose } from '../../contracts/messaging/llm';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { sendRuntimeMessage } from '../../platform/runtime-messaging/index';

const AI_SECRET_UNLOCK_POLL_INTERVAL_MS = 500;
const AI_SECRET_UNLOCK_WAIT_TIMEOUT_MS = 5 * 60 * 1000;

function waitForAISecretUnlockPoll(): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, AI_SECRET_UNLOCK_POLL_INTERVAL_MS);
  });
}

function readAISecretUnlockStatus(requestId: string) {
  return sendRuntimeMessage({
    requestId,
    type: MessageType.AI_SECRET_UNLOCK,
    operation: 'status',
  });
}

async function waitForAISecretUnlock(requestId: string): Promise<void> {
  const deadline = Date.now() + AI_SECRET_UNLOCK_WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await waitForAISecretUnlockPoll();
    const response = await readAISecretUnlockStatus(requestId);

    if (response.success && response.status === 'completed') {
      return;
    }
    if (
      !response.success ||
      response.status === 'expired' ||
      response.status === 'failed' ||
      response.status === 'restart-required'
    ) {
      throw new Error(response.error ?? 'AI provider secrets unlock was cancelled');
    }
  }

  throw new Error('AI provider secrets unlock timed out');
}

export async function requestAISecretUnlock(purpose: LlmSessionPurpose): Promise<void> {
  const response = await sendRuntimeMessage({
    purpose,
    type: MessageType.AI_SECRET_UNLOCK,
    operation: 'start',
  });

  if (response.success && response.status === 'completed') {
    return;
  }
  if (!response.success || response.status !== 'pending' || !response.requestId) {
    throw new Error(response.error ?? 'Unable to unlock AI provider secrets');
  }

  await waitForAISecretUnlock(response.requestId);
}
