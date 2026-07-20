import { describe, expect, it } from 'vitest';

import { isRuntimeMessageEnvelope } from './envelope';

describe('isRuntimeMessageEnvelope', () => {
  it('accepts runtime envelopes with a string type and optional numeric tab id', () => {
    expect(isRuntimeMessageEnvelope({ type: 'KEEP_ALIVE' })).toBe(true);
    expect(isRuntimeMessageEnvelope({ type: 'KEEP_ALIVE', tabId: 7 })).toBe(true);
  });

  it('rejects payloads without a valid runtime envelope shape', () => {
    expect(isRuntimeMessageEnvelope(null)).toBe(false);
    expect(isRuntimeMessageEnvelope({})).toBe(false);
    expect(isRuntimeMessageEnvelope({ type: 42 })).toBe(false);
    expect(isRuntimeMessageEnvelope({ type: 'KEEP_ALIVE', tabId: '7' })).toBe(false);
  });

  it('accepts zero tab ids and ignores unrelated payload fields', () => {
    expect(
      isRuntimeMessageEnvelope({
        type: 'KEEP_ALIVE',
        tabId: 0,
        payload: { ignored: true },
      })
    ).toBe(true);
  });
});
