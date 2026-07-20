import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import { isOwnedSettingsPage } from '../../../../platform/navigation/extension-pages';
import { isPopupTabRouteSenderUrl } from '../capabilities/popup-tab/route-capabilities';

type SettingsPageSenderClass = 'ai-unlock-settings-page' | 'ordinary-settings-page' | 'other';

function matchesExtensionPagePath(senderUrl: string | undefined, path: string): boolean {
  if (!senderUrl) {
    return false;
  }

  try {
    const expectedUrl = new URL(runtimeInfo.getURL(path));
    const actualUrl = new URL(senderUrl);
    return expectedUrl.origin === actualUrl.origin && expectedUrl.pathname === actualUrl.pathname;
  } catch {
    return false;
  }
}

export function classifySettingsPageSenderUrl(
  senderUrl: string | undefined
): SettingsPageSenderClass {
  if (
    !senderUrl ||
    !matchesExtensionPagePath(senderUrl, 'apps/extension/src/settings/index.html')
  ) {
    return 'other';
  }

  const actualUrl = new URL(senderUrl);
  return actualUrl.searchParams.get('aiUnlock') === '1'
    ? 'ai-unlock-settings-page'
    : 'ordinary-settings-page';
}

export function isScenarioEditorSenderUrl(senderUrl: string | undefined): boolean {
  return matchesExtensionPagePath(senderUrl, 'apps/extension/src/scenario-editor/index.html');
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
