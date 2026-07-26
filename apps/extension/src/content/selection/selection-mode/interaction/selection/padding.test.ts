import { describe, expect, it } from 'vitest';

import { adjustSelectionPadding } from './padding';

describe('selection-mode symmetric padding adjustment', () => {
  it('grows the selected area by five pixels on every available side', () => {
    expect(
      adjustSelectionPadding({ x: 20, y: 30, width: 100, height: 80 }, 'increase', {
        width: 300,
        height: 200,
      })
    ).toEqual({ x: 15, y: 25, width: 110, height: 90 });
  });

  it('shrinks the selected area by five pixels on every side', () => {
    expect(
      adjustSelectionPadding({ x: 20, y: 30, width: 100, height: 80 }, 'decrease', {
        width: 300,
        height: 200,
      })
    ).toEqual({ x: 25, y: 35, width: 90, height: 70 });
  });

  it('does not partially shrink when the full step would violate the minimum size', () => {
    const selection = { x: 20, y: 30, width: 19, height: 40 };

    expect(adjustSelectionPadding(selection, 'decrease', { width: 300, height: 200 })).toBe(
      selection
    );
  });

  it('does not partially grow when any viewport edge lacks a full step', () => {
    const selection = { x: 2, y: 3, width: 294, height: 194 };

    expect(adjustSelectionPadding(selection, 'increase', { width: 300, height: 200 })).toBe(
      selection
    );
  });
});
