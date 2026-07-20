import { describe, expect, it } from 'vitest';

import { isBoolean, isNumber, isRecord, isString } from './primitives';

describe('storage guard primitives', () => {
  it('accepts only non-null records', () => {
    expect(isRecord({ ok: true })).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(true);
    expect(isRecord('broken')).toBe(false);
  });

  it('accepts only primitive string, boolean, and finite number values', () => {
    expect(isString('value')).toBe(true);
    expect(isString(1)).toBe(false);

    expect(isBoolean(false)).toBe(true);
    expect(isBoolean('false')).toBe(false);

    expect(isNumber(42)).toBe(true);
    expect(isNumber(Number.NaN)).toBe(false);
    expect(isNumber(Infinity)).toBe(false);
  });
});
