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

    expect(position.x).toBeGreaterThanOrEqual(8);
    expect(position.y).toBeGreaterThanOrEqual(8);
    expect(position.y + 100).toBeLessThanOrEqual(232);
  });

  it('places an overlapping measured toolbar to the right and applies a final clamp', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1000);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(300);

    const position = calculateInteractiveFrameToolbarPosition(
      { x: 100, y: 50, width: 100, height: 220 },
      { width: 420, height: 50 }
    );

    expect(position.side).toBe('right');
    expect(position.x).toBe(210);
    expect(position.x).toBeGreaterThanOrEqual(8);
    expect(position.x + 420).toBeLessThanOrEqual(992);
  });

  it('keeps the toolbar next to the border point that selected the frame', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1000);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(700);

    const position = calculateInteractiveFrameToolbarPosition(
      { x: 100, y: 100, width: 400, height: 300 },
      { width: 160, height: 40 },
      { anchorPoint: { x: 430, y: 400 } }
    );

    expect(position).toEqual({ x: 350, y: 410, side: 'bottom' });
  });
});
