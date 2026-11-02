import type { StoredAISecretUnlockRequest } from '../../../composition/persistence/secret-protection/secret-unlock-requests.store.ts';
import { resolveSecretUnlockSenderKey } from './authorization/secret-unlock';

export function isUnlockRequestOwner(
  record: StoredAISecretUnlockRequest,
  sender: chrome.runtime.MessageSender
): boolean {
  const senderKey = resolveSecretUnlockSenderKey(record.purpose, sender);
  return record.senderKey === senderKey;
}
