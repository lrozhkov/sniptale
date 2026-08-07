import { describe, expect, it } from 'vitest';
import { getAdjacentControlGroupPosition } from './adjacent-controls';

const viewport = { height: 600, width: 800 };

describe('adjacent floating controls placement', () => {
  it('uses the canonical right-above position when it fits', () => {
    expect(
      getAdjacentControlGroupPosition({
        controlCount: 2,
        targetRect: { bottom: 240, left: 200, right: 300, top: 160 },
        viewport,
      })
    ).toEqual({ x: 306, y: 130 });
  });

  it('moves the group left when the target reaches the right viewport edge', () => {
    expect(
      getAdjacentControlGroupPosition({
        controlCount: 2,
        targetRect: { bottom: 240, left: 720, right: 800, top: 160 },
        viewport,
      })
    ).toEqual({ x: 658, y: 130 });
  });

  it('moves the group below when the target reaches the top viewport edge', () => {
    expect(
      getAdjacentControlGroupPosition({
        controlCount: 2,
        targetRect: { bottom: 42, left: 200, right: 300, top: 2 },
        viewport,
      })
    ).toEqual({ x: 306, y: 46 });
  });

  it('keeps even an oversized edge case inside the viewport margin', () => {
    expect(
      getAdjacentControlGroupPosition({
        controlCount: 2,
        targetRect: { bottom: 598, left: -20, right: 810, top: -10 },
        viewport,
      })
    ).toEqual({ x: 736, y: 8 });
  });
});
