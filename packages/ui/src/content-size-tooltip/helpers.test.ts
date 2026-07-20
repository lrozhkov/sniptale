import { describe, expect, it } from 'vitest';
import { parsePositiveInteger } from './helpers';

describe('content-size-tooltip helpers', () => {
  it('parses positive integers and rejects zero or invalid values', () => {
    expect(parsePositiveInteger('24')).toBe(24);
    expect(parsePositiveInteger('0')).toBeNull();
    expect(parsePositiveInteger('abc')).toBeNull();
  });
});
