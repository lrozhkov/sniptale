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
    ['right', { x: 995, y: 400 }, { x: 780, y: 380 }, 'vertical'],
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
  it.each([
    ['top-left', { x: 40, y: 12 }, { x: 8, y: 8 }, 'horizontal'],
    ['left-top', { x: 12, y: 40 }, { x: 8, y: 8 }, 'vertical'],
    ['top-right', { x: 960, y: 12 }, { x: 780, y: 8 }, 'horizontal'],
    ['right-top', { x: 988, y: 40 }, { x: 780, y: 8 }, 'vertical'],
    ['bottom-left', { x: 40, y: 788 }, { x: 8, y: 752 }, 'horizontal'],
    ['left-bottom', { x: 12, y: 760 }, { x: 8, y: 752 }, 'vertical'],
    ['bottom-right', { x: 960, y: 788 }, { x: 780, y: 752 }, 'horizontal'],
    ['right-bottom', { x: 988, y: 760 }, { x: 780, y: 752 }, 'vertical'],
  ] as const)('parks at %s on the side nearest the pointer', (edge, pointer, position, mode) => {
    const viewport = { width: 1000, height: 800 };
    expect(resolveToolbarDockEdge(pointer, viewport)).toBe(edge);
    expect(resolveToolbarDockPosition(edge, { width: 200, height: 40 }, viewport)).toEqual(
      position
    );
    expect(getToolbarDockDisplayMode(edge)).toBe(mode);
  });
  it('keeps oversized toolbar origins nonnegative', () => {
    expect(
      resolveToolbarDockPosition('right', { width: 400, height: 500 }, { width: 300, height: 200 })
    ).toEqual({ x: 0, y: 0 });
  });
});

it.each([
  [71, 'top-left'],
  [72, 'top-left'],
  [73, null],
] as const)('uses the visible corner threshold at x=%s', (x, edge) => {
  expect(resolveToolbarDockEdge({ x, y: 20 }, { width: 1000, height: 800 })).toBe(edge);
});

it.each([0, 1, 2] as const)('activates on entry to the visible right guide at row %s', (row) => {
  const viewport = { width: 1000, height: 800 };
  const innerBoundary = viewport.width - 8 - 12 - 64;
  const y = [40, 400, 760][row]!;
  expect(resolveToolbarDockEdge({ x: innerBoundary - 1, y }, viewport)).toBeNull();
  const edge = resolveToolbarDockEdge({ x: innerBoundary + 1, y }, viewport);
  expect(edge).toBe(['top-right', 'right', 'bottom-right'][row]);
});
