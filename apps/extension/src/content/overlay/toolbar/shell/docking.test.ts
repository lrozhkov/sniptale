import { describe, expect, it } from 'vitest';
import {
  getToolbarDockDisplayMode,
  resolveToolbarDockEdge,
  resolveToolbarDockPosition,
} from './docking';

describe('toolbar docking geometry', () => {
  it.each([
    ['top', { x: 500, y: 12 }, { x: 400, y: 8 }, 'horizontal'],
    ['bottom', { x: 500, y: 790 }, { x: 400, y: 752 }, 'horizontal'],
    ['left', { x: 5, y: 400 }, { x: 8, y: 380 }, 'vertical'],
    ['right', { x: 995, y: 400 }, { x: 792, y: 380 }, 'vertical'],
  ] as const)(
    'centers the toolbar at %s and selects its orientation',
    (edge, pointer, position, orientation) => {
      const viewport = { width: 1000, height: 800 };
      expect(resolveToolbarDockEdge(pointer, viewport)).toBe(edge);
      expect(resolveToolbarDockPosition(edge, { width: 200, height: 40 }, viewport)).toEqual(
        position
      );
      expect(getToolbarDockDisplayMode(edge)).toBe(orientation);
    }
  );
  it('does not select an edge from the middle of the page', () => {
    expect(resolveToolbarDockEdge({ x: 500, y: 400 }, { width: 1000, height: 800 })).toBeNull();
  });
  it('does not magnetize near corners outside the central third', () => {
    expect(resolveToolbarDockEdge({ x: 10, y: 10 }, { width: 1000, height: 800 })).toBeNull();
    expect(resolveToolbarDockEdge({ x: 990, y: 700 }, { width: 1000, height: 800 })).toBeNull();
  });
  it('keeps oversized toolbar origins nonnegative', () => {
    expect(
      resolveToolbarDockPosition('right', { width: 400, height: 500 }, { width: 300, height: 200 })
    ).toEqual({ x: 0, y: 0 });
  });
});
