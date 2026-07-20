import { expect, it } from 'vitest';
import { buildEllipseOutline } from './ellipse-outline';

it('builds a closed rotated ellipse outline with stable endpoints', () => {
  const outline = buildEllipseOutline({
    center: { x: 10, y: 12 },
    height: 8,
    rotation: Math.PI / 4,
    width: 20,
  });

  expect(outline).toHaveLength(49);
  expect(outline.at(-1)).toEqual(outline[0]);
  expect(outline[0]!.x).toBeGreaterThan(10);
});
