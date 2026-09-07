import { describe, expect, it } from 'vitest';
import { cx } from './helpers';

describe('workspace sidebar libraries shared helpers', () => {
  it('joins only truthy class names', () => {
    expect(cx('a', false, 'b', null, undefined)).toBe('a b');
  });
});
