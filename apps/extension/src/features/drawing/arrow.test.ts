import { expect, it } from 'vitest';
import { buildDrawingArrowOutline } from './arrow';

function createArrow(dynamicWidth: boolean) {
  return {
    color: '#ef4444',
    dynamicWidth,
    end: { x: 200, y: 0 },
    id: 'arrow',
    kind: 'arrow' as const,
    start: { x: 0, y: 0 },
    width: 18,
  };
}

it('mirrors the editor arrow profile by widening the shaft toward the head', () => {
  const dynamic = buildDrawingArrowOutline(createArrow(true));
  const uniform = buildDrawingArrowOutline(createArrow(false));

  expect(Math.abs(dynamic[0]!.y)).toBeLessThan(Math.abs(dynamic[1]!.y));
  expect(Math.abs(uniform[0]!.y)).toBe(Math.abs(uniform[1]!.y));
  expect(dynamic[3]).toEqual({ x: 200, y: 0 });
});

it('returns finite selectable geometry for a zero-length arrow', () => {
  const outline = buildDrawingArrowOutline({
    ...createArrow(true),
    end: { x: 0, y: 0 },
  });

  expect(outline).toHaveLength(4);
  expect(outline.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
});
