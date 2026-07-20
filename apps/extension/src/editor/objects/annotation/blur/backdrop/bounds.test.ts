import { describe, expect, it } from 'vitest';

import type { BlurRuntimeObject } from '../types';
import { resolveBackdropPadding, resolveBlurBounds } from './bounds';

function createBlurObject(overrides: Partial<BlurRuntimeObject> = {}): BlurRuntimeObject {
  return {
    height: 20,
    left: 10,
    top: 12,
    width: 40,
    ...overrides,
  } as BlurRuntimeObject;
}

describe('blur backdrop bounds owner', () => {
  it('resolves effect-specific backdrop padding', () => {
    expect(resolveBackdropPadding({ amount: 5, blurType: 'gaussian', showBorder: false })).toBe(15);
    expect(resolveBackdropPadding({ amount: 4, blurType: 'distortion', showBorder: false })).toBe(
      6
    );
    expect(resolveBackdropPadding({ amount: 9, blurType: 'pixelate', showBorder: false })).toBe(0);
    expect(resolveBackdropPadding({ amount: 9, blurType: 'solid', showBorder: false })).toBe(0);
  });

  it('builds padded capture bounds from the inner blur area', () => {
    expect(resolveBlurBounds(createBlurObject(), 6)).toEqual({
      height: 20,
      left: 4,
      paddedHeight: 32,
      paddedWidth: 52,
      top: 6,
      width: 40,
    });

    expect(
      resolveBlurBounds(createBlurObject({ showBorder: true, strokeWidth: 4 } as never), 2)
    ).toEqual(expect.objectContaining({ height: 20, width: 40 }));
  });
});
