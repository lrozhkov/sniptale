const OFFSCREEN_STARTUP_ID_PARAM = 'offscreenStartupId';
const PRIVACY_ERASURE_MODE_PARAM = 'privacyErasure';

export function createOffscreenStartupId(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (!randomUUID) {
    throw new Error('Offscreen startup id generation is unavailable.');
  }

  return randomUUID.call(globalThis.crypto);
}

export function createPrivacyErasureOffscreenDocumentUrl(
  offscreenUrl: string,
  offscreenStartupId: string
): string {
  const url = new URL(createOffscreenDocumentUrl(offscreenUrl, offscreenStartupId));
  url.searchParams.set(PRIVACY_ERASURE_MODE_PARAM, '1');
  return url.toString();
}

export function createOffscreenDocumentUrl(
  offscreenUrl: string,
  offscreenStartupId: string
): string {
  const url = new URL(offscreenUrl);
  url.searchParams.set(OFFSCREEN_STARTUP_ID_PARAM, offscreenStartupId);
  return url.toString();
}

export function resolveExistingOffscreenStartupId(
  existingContexts: chrome.runtime.ExtensionContext[]
): string {
  for (const context of existingContexts) {
    const offscreenStartupId = parseOffscreenStartupId(readContextDocumentUrl(context));
    if (offscreenStartupId) {
      return offscreenStartupId;
    }
  }
  return createOffscreenStartupId();
}

function readContextDocumentUrl(context: chrome.runtime.ExtensionContext): string | null {
  const contextRecord = context as unknown as Record<string, unknown>;
  const documentUrl = contextRecord['documentUrl'];
  if (typeof documentUrl === 'string') {
    return documentUrl;
  }

  const url = contextRecord['url'];
  return typeof url === 'string' ? url : null;
}

function parseOffscreenStartupId(documentUrl: string | null): string | null {
  if (!documentUrl) {
    return null;
  }

  try {
    const offscreenStartupId = new URL(documentUrl).searchParams.get(OFFSCREEN_STARTUP_ID_PARAM);
    return offscreenStartupId && offscreenStartupId.length > 0 ? offscreenStartupId : null;
  } catch {
    return null;
  }
}
