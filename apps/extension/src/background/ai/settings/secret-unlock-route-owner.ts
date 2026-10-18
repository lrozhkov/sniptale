import type { StoredAISecretUnlockRequest } from '../../../composition/persistence/ai-settings/secret-unlock-requests.store.ts';
import { resolveLlmSessionSenderKey } from '../llm/session-tokens';

export function isUnlockRequestOwner(
  record: StoredAISecretUnlockRequest,
  sender: chrome.runtime.MessageSender
): boolean {
  const senderKey = resolveLlmSessionSenderKey(record.purpose, sender);
  return record.senderKey === senderKey;
}
