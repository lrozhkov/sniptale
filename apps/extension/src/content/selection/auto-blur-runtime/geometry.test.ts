import { describe, expect, it } from 'vitest';
import { getAutoBlurRectUnion, normalizeAutoBlurRect } from './geometry';

describe('auto-blur geometry', () => {
  it('rounds fractional text bounds outward so edge pixels stay covered', () => {
    expect(
      normalizeAutoBlurRect({
        height: 16.2,
        width: 60.1,
        x: 10.75,
        y: 20.25,
      })
    ).toEqual({
      height: 17,
      width: 61,
      x: 10,
      y: 20,
    });
  });

  it('covers every rendered line of one detected value', () => {
    expect(
      getAutoBlurRectUnion([
        { height: 16, width: 80, x: 10, y: 20 },
        { height: 16, width: 40, x: 10, y: 40 },
      ])
    ).toEqual({ height: 36, width: 80, x: 10, y: 20 });
  });
});
