export const MAX_CLIPBOARD_TEXT_LENGTH = 50_000;

export function isClipboardTextWithinLimit(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_CLIPBOARD_TEXT_LENGTH;
}
