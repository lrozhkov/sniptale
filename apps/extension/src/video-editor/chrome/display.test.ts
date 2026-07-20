import { describe, expect, it } from 'vitest';

import { formatDuration, formatSize } from './display';

describe('video editor chrome display formatters', () => {
  it('formats timeline durations and byte sizes for compact library metadata', () => {
    expect(formatDuration(65.2)).toBe('1:05.2');
    expect(formatSize(512)).toBe('1 KB');
  });
});
