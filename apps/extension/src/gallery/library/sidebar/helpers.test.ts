import { describe, expect, it } from 'vitest';
import { cx } from './helpers';

describe('gallery-sidebar helpers', () => {
  it('joins truthy class names and skips empty values', () => {
    expect(cx('a', false, null, undefined, 'b')).toBe('a b');
  });
});
