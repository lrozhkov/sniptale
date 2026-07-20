import { expect, it, vi } from 'vitest';

import { closeEncoderQuietly, isAbortLikeError, normalizeError } from './errors';

it('normalizes encoder errors and recognises abort-like failures', () => {
  expect(normalizeError(new Error('boom'), 'fallback').message).toBe('boom');
  expect(normalizeError('plain text', 'fallback').message).toBe('plain text');
  expect(normalizeError('', 'fallback').message).toBe('fallback');

  expect(isAbortLikeError(new DOMException('aborted', 'AbortError'))).toBe(true);
  expect(isAbortLikeError(new Error('PROJECT_EXPORT_CANCELLED'))).toBe(true);
  expect(isAbortLikeError(new Error('nope'))).toBe(false);
});

it('closes encoders quietly when they are still open', () => {
  const closeMock = vi.fn();

  closeEncoderQuietly({ state: 'configured', close: closeMock } as never);
  expect(closeMock).toHaveBeenCalledOnce();

  expect(() =>
    closeEncoderQuietly({
      state: 'configured',
      close: () => {
        throw new Error('already closed');
      },
    } as never)
  ).not.toThrow();
  expect(() => closeEncoderQuietly({ state: 'closed', close: vi.fn() } as never)).not.toThrow();
});
