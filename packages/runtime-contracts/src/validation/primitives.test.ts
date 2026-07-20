import { describe, expect, it } from 'vitest';

import {
  isBoolean,
  isNullable,
  isNumber,
  isOptionalNullableString,
  isOptionalString,
  isPlainRecord,
  isRecord,
  isString,
} from './primitives';

describe('shared validation primitives', () => {
  it('recognizes primitive scalar validators', () => {
    expect(isRecord({ ok: true })).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isPlainRecord({ ok: true })).toBe(true);
    expect(isPlainRecord([])).toBe(false);
    expect(isString('value')).toBe(true);
    expect(isString(1)).toBe(false);
    expect(isNumber(1)).toBe(true);
    expect(isNumber(Number.NaN)).toBe(false);
    expect(isBoolean(false)).toBe(true);
    expect(isBoolean('false')).toBe(false);
  });

  it('builds nullable validators from required ones', () => {
    const isNullableString = isNullable(isString);

    expect(isNullableString(null)).toBe(true);
    expect(isNullableString('value')).toBe(true);
    expect(isNullableString(7)).toBe(false);
  });

  it('recognizes optional and optional-nullable strings', () => {
    expect(isOptionalString(undefined)).toBe(true);
    expect(isOptionalString('value')).toBe(true);
    expect(isOptionalString(null)).toBe(false);
    expect(isOptionalNullableString(undefined)).toBe(true);
    expect(isOptionalNullableString(null)).toBe(true);
    expect(isOptionalNullableString('value')).toBe(true);
    expect(isOptionalNullableString(7)).toBe(false);
  });
});
