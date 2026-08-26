import { describe, expect, it, vi } from 'vitest';

vi.mock('./index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./index')>()),
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) =>
    new Intl.NumberFormat('ru-RU', options).format(value),
  translate: (key: string) => key,
}));

import { formatBytes, formatCompactBytes } from './format-bytes';

describe('formatBytes', () => {
  it('formats zero and scaled byte values with translated units', () => {
    expect(formatBytes(0)).toBe('shared.bytes.zero');
    expect(formatBytes(1024)).toBe('1 shared.bytes.kb');
    expect(formatBytes(5 * 1024 * 1024, 2)).toBe('5 shared.bytes.mb');
  });

  it('keeps compact values within three significant digits by promoting units early', () => {
    expect(formatCompactBytes(50 * 1024)).toBe('50 shared.bytes.kb');
    expect(formatCompactBytes(150 * 1024)).toBe('0,15 shared.bytes.mb');
    expect(formatCompactBytes(12.34 * 1024 * 1024)).toBe('12,3 shared.bytes.mb');
    expect(formatCompactBytes(150 * 1024 * 1024)).toBe('0,15 shared.bytes.gb');
  });
});
