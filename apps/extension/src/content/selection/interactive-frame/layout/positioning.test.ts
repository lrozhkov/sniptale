// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateInteractiveFrameToolbarPosition } from './positioning';

afterEach(() => vi.restoreAllMocks());

describe('calculateInteractiveFrameToolbarPosition', () => {
  it('uses measured toolbar dimensions and clamps a wrapped toolbar into the viewport', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(320);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(240);

    const position = calculateInteractiveFrameToolbarPosition(
      { x: 280, y: 10, width: 80, height: 80 },
      { width: 500, height: 100 }
    );

    expect(position.x).toBe(10);
    expect(position.y).toBeGreaterThanOrEqual(10);
    expect(position.y + 100).toBeLessThanOrEqual(230);
  });

  it('places an overlapping measured toolbar to the right and applies a final clamp', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1000);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(300);

    const position = calculateInteractiveFrameToolbarPosition(
      { x: 100, y: 50, width: 100, height: 220 },
      { width: 420, height: 50 }
    );

    expect(position.x).toBe(210);
    expect(position.x).toBeGreaterThanOrEqual(10);
    expect(position.x + 420).toBeLessThanOrEqual(990);
  });
});
