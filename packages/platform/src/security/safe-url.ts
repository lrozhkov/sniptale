const SAFE_EXTERNAL_URL_PROTOCOLS = new Set(['http:', 'https:']);

export function createSafeExternalHref(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const parsedUrl = new URL(value);
    return SAFE_EXTERNAL_URL_PROTOCOLS.has(parsedUrl.protocol) ? value : null;
  } catch {
    return null;
  }
}
