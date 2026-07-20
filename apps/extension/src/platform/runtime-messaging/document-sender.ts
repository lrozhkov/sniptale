import { runtimeInfo } from '@sniptale/platform/browser/runtime';

export function resolveExtensionDocumentSenderUrl(
  sender: chrome.runtime.MessageSender | undefined,
  expectedPath: string
): string | null {
  if (!sender?.url) {
    return null;
  }

  try {
    const expectedUrl = new URL(runtimeInfo.getURL(expectedPath));
    const senderUrl = new URL(sender.url);
    const senderDocumentUrl = `${senderUrl.protocol}//${senderUrl.host}${senderUrl.pathname}`;
    const expectedDocumentUrl = `${expectedUrl.protocol}//${expectedUrl.host}${expectedUrl.pathname}`;
    return senderDocumentUrl === expectedDocumentUrl ? senderDocumentUrl : null;
  } catch {
    return null;
  }
}
