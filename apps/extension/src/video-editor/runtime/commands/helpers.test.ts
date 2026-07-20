import { describe, expect, it } from 'vitest';
import { toErrorMessage } from './helpers';

describe('video editor action handler helpers', () => {
  it('normalizes error-like values into readable strings', () => {
    expect(toErrorMessage(new Error('boom'))).toBe('boom');
    expect(toErrorMessage('fallback')).toBe('fallback');
  });
});
