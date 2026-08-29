import { describe, expect, it } from 'vitest';
import {
  normalizePagePackageCaptureUrl,
  parsePagePackageCaptureTimingPolicy,
} from './capture-sources';

describe('Page Package capture source policy', () => {
  it('normalizes supported web addresses while preserving SPA routes', () => {
    expect(normalizePagePackageCaptureUrl(' example.com/path#section ')).toBe(
      'https://example.com/path#section'
    );
    expect(normalizePagePackageCaptureUrl('http://example.com')).toBe('http://example.com/');
  });

  it('rejects active, authenticated, malformed, and non-web addresses', () => {
    expect(normalizePagePackageCaptureUrl('javascript:alert(1)')).toBeNull();
    expect(normalizePagePackageCaptureUrl('https://user:secret@example.com')).toBeNull();
    expect(normalizePagePackageCaptureUrl('chrome://settings')).toBeNull();
    expect(normalizePagePackageCaptureUrl('not an address')).toBeNull();
  });

  it('accepts only exact bounded capture timing objects', () => {
    expect(
      parsePagePackageCaptureTimingPolicy({ loadTimeoutMs: 30_000, settleDelayMs: 2_000 })
    ).toEqual({ loadTimeoutMs: 30_000, settleDelayMs: 2_000 });
    expect(
      parsePagePackageCaptureTimingPolicy({ loadTimeoutMs: 0, settleDelayMs: 2_000 })
    ).toBeNull();
    expect(
      parsePagePackageCaptureTimingPolicy({ loadTimeoutMs: 30_000, settleDelayMs: -1 })
    ).toBeNull();
    expect(
      parsePagePackageCaptureTimingPolicy({
        loadTimeoutMs: 30_000,
        settleDelayMs: 2_000,
        extra: true,
      })
    ).toBeNull();
  });
});
