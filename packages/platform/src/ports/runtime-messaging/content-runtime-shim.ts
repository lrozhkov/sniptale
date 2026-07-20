import { attachRuntimeMessageFreshness } from '../../security/runtime-message-freshness';

export function sendContentRuntimeShimMessage(message: Record<string, unknown>): Promise<unknown> {
  return chrome.runtime.sendMessage(attachRuntimeMessageFreshness(message));
}
