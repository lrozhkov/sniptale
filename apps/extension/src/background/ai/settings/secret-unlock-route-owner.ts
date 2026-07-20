import type { StoredAISecretUnlockRequest } from '../../../composition/persistence/ai-settings/secret-unlock-requests.store.ts';
import { resolveLlmSessionSenderKey } from '../llm/session-tokens';

export function isUnlockRequestOwner(
  record: StoredAISecretUnlockRequest,
  sender: chrome.runtime.MessageSender
): boolean {
  const senderKey =
    resolveLlmSessionSenderKey('content-ai-pick', sender) ??
    resolveLlmSessionSenderKey('scenario-editor', sender);
  return record.senderKey === senderKey;
}
