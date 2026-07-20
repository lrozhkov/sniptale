import { afterEach, expect, it, vi } from 'vitest';

import { createSecureRandomUuid } from './secure-random-id';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('uses crypto randomUUID when available', () => {
  const randomUUID = vi.fn(() => 'secure-id');
  vi.stubGlobal('crypto', { randomUUID });

  expect(createSecureRandomUuid('missing crypto')).toBe('secure-id');
  expect(randomUUID).toHaveBeenCalledTimes(1);
});

it('uses crypto random values when randomUUID is unavailable', () => {
  vi.stubGlobal('crypto', {
    getRandomValues: vi.fn((array: Uint8Array) => {
      array.set([
        0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e,
        0x0f,
      ]);
      return array;
    }),
  });

  expect(createSecureRandomUuid('missing crypto')).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
});

it('fails closed when secure random values are unavailable', () => {
  vi.stubGlobal('crypto', {});

  expect(() => createSecureRandomUuid('missing crypto')).toThrow('missing crypto');
});
