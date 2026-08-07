import { VOICE_INPUT_TEST_SESSION_DURATION_MS } from '@sniptale/runtime-contracts/voice-input';
import { resolveExtensionDocumentSenderUrl } from '../../platform/runtime-messaging/document-sender';

export type VoiceInputConsumerId = 'content-page-tools' | 'editor-callout' | 'settings-test';

const voiceInputConsumerPolicies = [
  {
    id: 'editor-callout',
    documentPath: 'apps/extension/src/editor/index.html',
    maxDurationMs: null,
  },
  {
    id: 'settings-test',
    documentPath: 'apps/extension/src/settings/index.html',
    maxDurationMs: VOICE_INPUT_TEST_SESSION_DURATION_MS,
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

export function authorizeVoiceInputPortSender(sender: chrome.runtime.MessageSender | undefined): {
  consumerId: VoiceInputConsumerId;
  documentId: string;
  maxDurationMs: typeof VOICE_INPUT_TEST_SESSION_DURATION_MS | null;
} | null {
  if (!sender?.documentId) return null;
  const policy = voiceInputConsumerPolicies.find((candidate) =>
    resolveExtensionDocumentSenderUrl(sender, candidate.documentPath)
  );
  if (policy) {
    return {
      consumerId: policy.id,
      documentId: sender.documentId,
      maxDurationMs: policy.maxDurationMs,
    };
  }
  return isTopLevelWebContentSender(sender)
    ? {
        consumerId: 'content-page-tools',
        documentId: sender.documentId,
        maxDurationMs: null,
      }
    : null;
}
