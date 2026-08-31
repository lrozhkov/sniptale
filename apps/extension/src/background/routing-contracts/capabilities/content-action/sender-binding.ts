import type { ContentSenderBinding } from './capability-store';
import { runtimeInfo } from '@sniptale/platform/browser/runtime';

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
  resolvedTabId?: number | undefined,
  options: { allowOwnedExtensionSender?: boolean } = {}
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

  let senderUrl = sender.url;
  try {
    const parsedSenderUrl = new URL(sender.url);
    if (
      parsedSenderUrl.protocol === 'chrome-extension:' ||
      parsedSenderUrl.protocol === 'moz-extension:'
    ) {
      if (options.allowOwnedExtensionSender) {
        try {
          const ownedExtensionUrl = new URL(runtimeInfo.getURL(''));
          if (
            parsedSenderUrl.protocol === ownedExtensionUrl.protocol &&
            parsedSenderUrl.host === ownedExtensionUrl.host
          ) {
            senderUrl = parsedSenderUrl.href;
            return {
              allowed: true,
              principal: {
                documentId: sender.documentId,
                frameId: sender.frameId,
                senderUrl,
                tabId: sender.tab.id,
              },
            };
          }
        } catch {
          // Fall through to the strict page-URL projection below.
        }
      }
      const contentDocumentUrl = [sender.tab.url, sender.origin].find((candidate) => {
        if (typeof candidate !== 'string') return false;
        try {
          const protocol = new URL(candidate).protocol;
          return protocol === 'http:' || protocol === 'https:' || protocol === 'file:';
        } catch {
          return false;
        }
      });
      if (!contentDocumentUrl) {
        return { allowed: false, reason: 'extension-sender' };
      }
      senderUrl = contentDocumentUrl;
    }
  } catch {
    return { allowed: false, reason: 'invalid-sender-url' };
  }

  return {
    allowed: true,
    principal: {
      documentId: sender.documentId,
      frameId: sender.frameId,
      senderUrl,
      tabId: sender.tab.id,
    },
  };
}
