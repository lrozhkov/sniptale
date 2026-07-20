import { translate } from '../../../../platform/i18n';

function sanitizeTitle(value: string): string {
  const next = value.trim();
  return next.length > 0 ? next : translate('editor.runtime.newTab');
}

function sanitizeUrl(value: string): string {
  const next = value.trim();
  if (next.length === 0) {
    return 'example.com';
  }

  return next;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncateText(value: string, maxLength: number): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function resolveMaxLength(width: number, averageGlyphWidth: number, floor: number): number {
  return Math.max(floor, Math.floor(width / averageGlyphWidth));
}

export function resolveExactBrowserFrameTitleText(slotWidth: number, value: string): string {
  return escapeXml(truncateText(sanitizeTitle(value), resolveMaxLength(slotWidth, 7.2, 14)));
}

export function resolveExactBrowserFrameUrlText(_slotWidth: number, value: string): string {
  return escapeXml(sanitizeUrl(value));
}
