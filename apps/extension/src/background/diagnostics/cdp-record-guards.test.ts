import { describe, expect, it } from 'vitest';
import { isObjectRecord, isOptionalStringRecord } from './cdp-record-guards';

describe('background shared cdp record guards', () => {
  it('recognizes object records', () => {
    expect(isObjectRecord({ value: 1 })).toBe(true);
    expect(isObjectRecord(null)).toBe(false);
    expect(isObjectRecord('text')).toBe(false);
  });

  it('accepts undefined and string records for optional string record values', () => {
    expect(isOptionalStringRecord(undefined)).toBe(true);
    expect(isOptionalStringRecord({ one: '1', two: '2' })).toBe(true);
    expect(isOptionalStringRecord({ one: 1 })).toBe(false);
  });
});
