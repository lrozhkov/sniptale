type OffscreenCommandSender = chrome.runtime.MessageSender | undefined;

const UNAUTHORIZED_OFFSCREEN_COMMAND_SENDER = 'Unauthorized offscreen command sender';
const BACKGROUND_SENDER_PATHNAMES = [
  '/_generated_background_page.html',
  '/service-worker-loader.js',
  '/apps/extension/src/background/index.ts',
  '/apps/extension/src/background/index.js',
] as const;

function parseSameExtensionUrl(value: string | undefined, extensionId: string): URL | null {
  if (!value) {
    return null;
  }

  try {
    const senderUrl = new URL(value);
    return senderUrl.protocol === 'chrome-extension:' && senderUrl.host === extensionId
      ? senderUrl
      : null;
  } catch {
    return null;
  }
}

function isBackgroundSenderPathname(pathname: string): boolean {
  return BACKGROUND_SENDER_PATHNAMES.includes(
    pathname as (typeof BACKGROUND_SENDER_PATHNAMES)[number]
  );
}

export function getUnauthorizedOffscreenCommandSenderReason(
  sender: OffscreenCommandSender
): string | null {
  if (!sender) {
    return UNAUTHORIZED_OFFSCREEN_COMMAND_SENDER;
  }

  if (sender.tab) {
    return UNAUTHORIZED_OFFSCREEN_COMMAND_SENDER;
  }

  if (!sender.id) {
    return UNAUTHORIZED_OFFSCREEN_COMMAND_SENDER;
  }

  if (!sender.url) {
    return UNAUTHORIZED_OFFSCREEN_COMMAND_SENDER;
  }

  const senderUrl = parseSameExtensionUrl(sender.url, sender.id);
  const senderOrigin = parseSameExtensionUrl(sender.origin, sender.id);
  if (!senderUrl || (sender.origin && !senderOrigin)) {
    return UNAUTHORIZED_OFFSCREEN_COMMAND_SENDER;
  }

  if (!isBackgroundSenderPathname(senderUrl.pathname)) {
    return UNAUTHORIZED_OFFSCREEN_COMMAND_SENDER;
  }

  return null;
}
