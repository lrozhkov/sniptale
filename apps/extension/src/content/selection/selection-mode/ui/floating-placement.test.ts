import { describe, expect, it } from 'vitest';
import { placeSelectionFloatingSurface, type SelectionFloatingRect } from './floating-placement';

function intersects(first: SelectionFloatingRect, second: SelectionFloatingRect) {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

describe('crop floating surface placement', () => {
  const viewport = { width: 1280, height: 560 };

  it('uses the space below a top-edge crop rather than its interior', () => {
    const crop = { x: 200, y: 8, width: 500, height: 300 };
    const toolbar = { x: 200, y: 320, width: 640, height: 50 };
    const position = placeSelectionFloatingSurface({
      anchor: toolbar,
      exclusion: crop,
      protectedRect: toolbar,
      width: 700,
      height: 56,
      viewport,
    });
    expect(position.y).toBe(380);
    expect(intersects({ ...position, width: 700, height: 56 }, crop)).toBe(false);
  });

  it('uses a side region when the crop spans the viewport height', () => {
    const crop = { x: 8, y: 8, width: 500, height: 544 };
    const position = placeSelectionFloatingSurface({
      anchor: crop,
      exclusion: crop,
      width: 640,
      height: 50,
      viewport,
    });
    expect(position.x).toBe(518);
    expect(intersects({ ...position, width: 640, height: 50 }, crop)).toBe(false);
  });

  it('keeps complete selection-action pairs outside the crop when they fit', () => {
    const crop = { x: 300, y: 8, width: 500, height: 200 };
    const toolbar = { x: 300, y: 220, width: 640, height: 50 };
    const position = placeSelectionFloatingSurface({
      anchor: toolbar,
      exclusion: crop,
      protectedRect: toolbar,
      width: 1100,
      height: 56,
      viewport,
    });
    expect(position.y).toBe(280);
    expect(position.x).toBeLessThanOrEqual(172);
    expect(intersects({ ...position, width: 1100, height: 56 }, crop)).toBe(false);
  });

  it('retains a viewport-bound fallback without covering the primary toolbar', () => {
    const crop = { x: 8, y: 8, width: 1264, height: 544 };
    const toolbar = { x: 18, y: 18, width: 640, height: 50 };
    const position = placeSelectionFloatingSurface({
      anchor: toolbar,
      exclusion: crop,
      protectedRect: toolbar,
      width: 900,
      height: 56,
      viewport,
    });
    const surface = { ...position, width: 900, height: 56 };
    expect(intersects(surface, crop)).toBe(true);
    expect(intersects(surface, toolbar)).toBe(false);
    expect(position.x).toBeGreaterThanOrEqual(8);
    expect(position.y).toBeGreaterThanOrEqual(8);
    expect(position.x + 900).toBeLessThanOrEqual(1272);
    expect(position.y + 56).toBeLessThanOrEqual(552);
  });
});
