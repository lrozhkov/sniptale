import type { ContentSenderBinding } from './capability-store';

type ContentSenderAuthorizationDenial =
  | 'extension-sender'
  | 'invalid-sender-url'
  | 'missing-document-id'
  | 'missing-frame-id'
  | 'missing-tab-id'
  | 'resolved-tab-mismatch'
  | 'subframe-sender';

type ContentSenderAuthorizationDecision =
  | { allowed: true; principal: ContentSenderBinding }
  | { allowed: false; reason: ContentSenderAuthorizationDenial };

export function authorizeContentSender(
  sender: chrome.runtime.MessageSender | undefined,
  resolvedTabId?: number | undefined
): ContentSenderAuthorizationDecision {
  if (sender?.tab?.id === undefined) {
    return { allowed: false, reason: 'missing-tab-id' };
  }
  if (resolvedTabId !== undefined && sender.tab.id !== resolvedTabId) {
    return { allowed: false, reason: 'resolved-tab-mismatch' };
  }
  if (sender.frameId === undefined) {
    return { allowed: false, reason: 'missing-frame-id' };
  }
  if (sender.frameId !== 0) {
    return { allowed: false, reason: 'subframe-sender' };
  }
  if (typeof sender.documentId !== 'string' || sender.documentId.length === 0) {
    return { allowed: false, reason: 'missing-document-id' };
  }
  if (typeof sender.url !== 'string') {
    return { allowed: false, reason: 'invalid-sender-url' };
  }

  try {
    const senderUrl = new URL(sender.url);
    if (senderUrl.protocol === 'chrome-extension:' || senderUrl.protocol === 'moz-extension:') {
      return { allowed: false, reason: 'extension-sender' };
    }
  } catch {
    return { allowed: false, reason: 'invalid-sender-url' };
  }

  return {
    allowed: true,
    principal: {
      documentId: sender.documentId,
      frameId: sender.frameId,
      senderUrl: sender.url,
      tabId: sender.tab.id,
    },
  };
}
