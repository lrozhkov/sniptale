import { describe, expect, it } from 'vitest';

import { Z_INDEX_BASE } from './constants';

describe('selection-mode constants', () => {
  it('keeps frame chrome below the fixed size tooltip layer', () => {
    expect(Z_INDEX_BASE + 2).toBeLessThan(2147483647);
  });
});
