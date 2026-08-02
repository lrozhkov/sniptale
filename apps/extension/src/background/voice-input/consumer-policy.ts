import { resolveExtensionDocumentSenderUrl } from '../../platform/runtime-messaging/document-sender';

export type VoiceInputConsumerId = 'settings-test';

const voiceInputConsumerPolicies = [
  {
    id: 'settings-test',
    documentPath: 'apps/extension/src/settings/index.html',
  },
] as const;

export function authorizeVoiceInputPortSender(
  sender: chrome.runtime.MessageSender | undefined
): { consumerId: VoiceInputConsumerId; documentId: string } | null {
  if (!sender?.documentId) return null;
  const policy = voiceInputConsumerPolicies.find((candidate) =>
    resolveExtensionDocumentSenderUrl(sender, candidate.documentPath)
  );
  return policy ? { consumerId: policy.id, documentId: sender.documentId } : null;
}
