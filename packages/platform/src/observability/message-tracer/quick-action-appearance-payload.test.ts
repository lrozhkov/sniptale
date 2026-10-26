import { describe, expect, it } from 'vitest';
import {
  isQuickActionAppearanceTraceMessageType,
  sanitizeQuickActionAppearanceTracePayload,
} from './quick-action-appearance-payload';

const type = 'OFFSCREEN_QUICK_ACTION_HEADER';
describe('quick-action appearance trace projection', () => {
  it('keeps only bounded dimensions and the result flag for exact command labels', () => {
    for (const messageType of [type, `${type}_RESPONSE`]) {
      expect(isQuickActionAppearanceTraceMessageType(messageType)).toBe(true);
      expect(
        sanitizeQuickActionAppearanceTracePayload(messageType, {
          source: { width: 640, height: 480, title: 'private' },
          success: false,
          header: { title: 'private', url: 'https://private.example/' },
          dataUrl: 'private',
          capabilityToken: 'private',
          error: 'private',
        })
      ).toEqual({ type, source: { width: 640, height: 480 }, success: false });
    }
  });
  it('drops malformed or excessive dimensions and all non-object payloads', () => {
    for (const value of [
      null,
      undefined,
      'private',
      [],
      { source: { width: 32769, height: 1 } },
      { source: { width: NaN, height: 1 } },
      { source: { width: 1.5, height: 1 } },
      { source: { width: 0, height: 1 } },
      { source: { width: '2', height: 1 } },
    ]) {
      expect(sanitizeQuickActionAppearanceTracePayload(type, value)).toEqual({ type });
    }
  });
  it('preserves unrelated messages without broad prefix matching', () => {
    const payload = { header: 'unchanged' };
    for (const messageType of ['OTHER', `${type}_OTHER`]) {
      expect(isQuickActionAppearanceTraceMessageType(messageType)).toBe(false);
      expect(sanitizeQuickActionAppearanceTracePayload(messageType, payload)).toBe(payload);
    }
  });
});
