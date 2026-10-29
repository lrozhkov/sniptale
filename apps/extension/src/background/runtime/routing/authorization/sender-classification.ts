import { classifySettingsPageSenderUrl } from '../../../../platform/navigation/extension-pages/sender-url';
import { isOwnedSettingsPage } from '../../../../platform/navigation/extension-pages';
import { isOwnedExtensionPagePath } from '../../../../platform/navigation/extension-pages/sender-url';
import { isPopupTabRouteSenderUrl } from '../capabilities/popup-tab/route-capabilities';

export function isWebSnapshotViewerSenderUrl(senderUrl: string | undefined): boolean {
  return isOwnedExtensionPagePath(senderUrl, 'apps/extension/src/web-snapshot-viewer/index.html');
}

export function isPageAccessSenderUrl(senderUrl: string | undefined): boolean {
  if (!senderUrl) {
    return false;
  }

  return isPopupTabRouteSenderUrl(senderUrl) || isOwnedSettingsPage(senderUrl);
}

export function classifyBackgroundOwnedSender(sender: chrome.runtime.MessageSender): string {
  if (sender.tab?.id !== undefined) {
    return 'content-tab-runtime';
  }
  if (classifySettingsPageSenderUrl(sender.url) !== 'other') {
    return 'settings-page';
  }
  if (isPopupTabRouteSenderUrl(sender.url)) {
    return 'popup-page';
  }
  return sender.url ? 'extension-or-web-runtime' : 'unknown-runtime';
}
