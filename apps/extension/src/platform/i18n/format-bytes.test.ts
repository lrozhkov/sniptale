import { describe, expect, it, vi } from 'vitest';

vi.mock('./index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./index')>()),
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) =>
    `${value.toFixed(options?.maximumFractionDigits ?? 0)}`,
  translate: (key: string) => key,
}));

import { formatBytes } from './format-bytes';

describe('formatBytes', () => {
  it('formats zero and scaled byte values with translated units', () => {
    expect(formatBytes(0)).toBe('shared.bytes.zero');
    expect(formatBytes(1024)).toBe('1.0 shared.bytes.kb');
    expect(formatBytes(5 * 1024 * 1024, 2)).toBe('5.00 shared.bytes.mb');
  });
});
