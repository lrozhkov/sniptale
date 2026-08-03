import { resolveExtensionDocumentSenderUrl } from '../../platform/runtime-messaging/document-sender';

export type VoiceInputConsumerId = 'content-design-review' | 'settings-test';

const voiceInputConsumerPolicies = [
  {
    id: 'settings-test',
    documentPath: 'apps/extension/src/settings/index.html',
  },
] as const;

function isTopLevelWebContentSender(sender: chrome.runtime.MessageSender): boolean {
  if (typeof sender.tab?.id !== 'number' || sender.frameId !== 0 || !sender.url) return false;
  try {
    const protocol = new URL(sender.url).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export function authorizeVoiceInputPortSender(
  sender: chrome.runtime.MessageSender | undefined
): { consumerId: VoiceInputConsumerId; documentId: string } | null {
  if (!sender?.documentId) return null;
  const policy = voiceInputConsumerPolicies.find((candidate) =>
    resolveExtensionDocumentSenderUrl(sender, candidate.documentPath)
  );
  if (policy) return { consumerId: policy.id, documentId: sender.documentId };
  return isTopLevelWebContentSender(sender)
    ? { consumerId: 'content-design-review', documentId: sender.documentId }
    : null;
}
