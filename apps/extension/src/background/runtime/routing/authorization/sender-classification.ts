import { isOwnedSettingsPage } from '../../../../platform/navigation/extension-pages';
import { isOwnedExtensionPagePath } from '../../../../platform/navigation/extension-pages/sender-url';
import { isPopupTabRouteSenderUrl } from '../capabilities/popup-tab/route-capabilities';

type SettingsPageSenderClass = 'ai-unlock-settings-page' | 'ordinary-settings-page' | 'other';

export function classifySettingsPageSenderUrl(
  senderUrl: string | undefined
): SettingsPageSenderClass {
  if (
    !senderUrl ||
    !isOwnedExtensionPagePath(senderUrl, 'apps/extension/src/settings/index.html')
  ) {
    return 'other';
  }

  const actualUrl = new URL(senderUrl);
  return actualUrl.searchParams.get('aiUnlock') === '1'
    ? 'ai-unlock-settings-page'
    : 'ordinary-settings-page';
}

export function isScenarioEditorSenderUrl(senderUrl: string | undefined): boolean {
  return isOwnedExtensionPagePath(senderUrl, 'apps/extension/src/scenario-editor/index.html');
}

export function isImageEditorSenderUrl(senderUrl: string | undefined): boolean {
  return isOwnedExtensionPagePath(senderUrl, 'apps/extension/src/editor/index.html');
}

export function isGallerySenderUrl(senderUrl: string | undefined): boolean {
  return isOwnedExtensionPagePath(senderUrl, 'apps/extension/src/gallery/index.html');
}

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
