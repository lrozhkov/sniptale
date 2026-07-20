import { describe, expect, it } from 'vitest';

import { formatBadgeTime, formatLongTime } from './formatters';

describe('badge-state formatters', () => {
  it('formats short, minute, and hour badge times', () => {
    expect(formatBadgeTime(5)).toBe('0:05');
    expect(formatBadgeTime(901)).toBe('15m');
    expect(formatBadgeTime(3_600)).toBe('1h');
  });

  it('formats long times with and without hours', () => {
    expect(formatLongTime(125)).toBe('02:05');
    expect(formatLongTime(3_661)).toBe('1:01:01');
  });
});
