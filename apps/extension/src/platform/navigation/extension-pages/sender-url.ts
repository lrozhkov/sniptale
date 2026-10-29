import { runtimeInfo } from '@sniptale/platform/browser/runtime';

export function isOwnedExtensionPagePath(senderUrl: string | undefined, path: string): boolean {
  if (!senderUrl) return false;
  try {
    const expectedUrl = new URL(runtimeInfo.getURL(path));
    const actualUrl = new URL(senderUrl);
    return (
      expectedUrl.protocol === actualUrl.protocol &&
      expectedUrl.host === actualUrl.host &&
      expectedUrl.pathname === actualUrl.pathname
    );
  } catch {
    return false;
  }
}

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
