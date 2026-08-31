import {
  isSafeWebSnapshotCaptureAssetUrl,
  sanitizeWebSnapshotCssText,
} from '../../../../features/web-snapshot/public';

function rewriteCapturedCssUrl(value: string, baseUrl: string): string | null {
  const trimmedValue = value.trim();
  if (trimmedValue.startsWith('#')) return trimmedValue;
  if (!isSafeWebSnapshotCaptureAssetUrl(trimmedValue, baseUrl)) return null;
  try {
    const resolved = new URL(trimmedValue, baseUrl);
    return ['data:', 'http:', 'https:'].includes(resolved.protocol) ? resolved.href : null;
  } catch {
    return null;
  }
}

export function sanitizePreparedSnapshotCapturedCssText(
  cssText: string,
  stylesheetBaseUrl: string
): string {
  return sanitizeWebSnapshotCssText(cssText, (url) =>
    rewriteCapturedCssUrl(url, stylesheetBaseUrl)
  );
}
