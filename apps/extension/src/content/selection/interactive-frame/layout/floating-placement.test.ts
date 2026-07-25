import { describe, expect, it } from 'vitest';
import { calculateFrameFloatingPlacement } from './floating-placement';

function overlap(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

describe('frame floating placement', () => {
  it('never clamps a toolbar back over its selected frame when another side is available', () => {
    const frame = { x: 8, y: 8, width: 180, height: 120 };
    const placement = calculateFrameFloatingPlacement({
      anchorRect: frame,
      avoidanceRect: frame,
      size: { width: 260, height: 48 },
      viewport: { width: 640, height: 480 },
    });

    expect(overlap(placement.rect, frame)).toBe(false);
    expect(placement.side).not.toBe('top');
  });

  it('moves an inner-frame toolbar to another side instead of covering an outer border', () => {
    const inner = { x: 180, y: 160, width: 140, height: 90 };
    const outerTopBorder = { x: 80, y: 100, width: 420, height: 12 };
    const placement = calculateFrameFloatingPlacement({
      anchorRect: inner,
      avoidanceRect: inner,
      size: { width: 220, height: 48 },
      strictRects: [outerTopBorder],
      viewport: { width: 700, height: 500 },
    });

    expect(overlap(placement.rect, inner)).toBe(false);
    expect(overlap(placement.rect, outerTopBorder)).toBe(false);
  });

  it('allows another frame interior as a soft zone when strict alternatives are worse', () => {
    const selected = { x: 240, y: 200, width: 120, height: 80 };
    const outerInterior = { x: 100, y: 100, width: 420, height: 300 };
    const placement = calculateFrameFloatingPlacement({
      anchorRect: selected,
      avoidanceRect: selected,
      size: { width: 180, height: 44 },
      softRects: [outerInterior],
      viewport: { width: 800, height: 600 },
    });

    expect(overlap(placement.rect, selected)).toBe(false);
    expect(placement.distanceToAnchor).toBe(10);
  });

  it('can move beyond an outer frame when every inner gap is too narrow', () => {
    const inner = { x: 130, y: 130, width: 340, height: 240 };
    const outerBorders = [
      { x: 95, y: 95, width: 410, height: 10 },
      { x: 95, y: 395, width: 410, height: 10 },
      { x: 95, y: 105, width: 10, height: 290 },
      { x: 495, y: 105, width: 10, height: 290 },
    ];
    const placement = calculateFrameFloatingPlacement({
      anchorRect: inner,
      avoidanceRect: inner,
      size: { width: 220, height: 80 },
      softRects: [{ x: 100, y: 100, width: 400, height: 300 }],
      strictRects: outerBorders,
      viewport: { width: 800, height: 600 },
    });

    expect(outerBorders.some((border) => overlap(placement.rect, border))).toBe(false);
    expect(placement.distanceToAnchor).toBeGreaterThan(10);
  });
});
