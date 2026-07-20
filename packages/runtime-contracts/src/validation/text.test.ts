import { describe, expect, it } from 'vitest';

import { MAX_CLIPBOARD_TEXT_LENGTH, isClipboardTextWithinLimit } from './text';

describe('isClipboardTextWithinLimit', () => {
  it('accepts strings up to the configured clipboard limit', () => {
    expect(isClipboardTextWithinLimit('copied')).toBe(true);
    expect(isClipboardTextWithinLimit('x'.repeat(MAX_CLIPBOARD_TEXT_LENGTH))).toBe(true);
  });

  it('rejects oversized clipboard payloads and non-strings', () => {
    expect(isClipboardTextWithinLimit('x'.repeat(MAX_CLIPBOARD_TEXT_LENGTH + 1))).toBe(false);
    expect(isClipboardTextWithinLimit(42)).toBe(false);
  });
});
