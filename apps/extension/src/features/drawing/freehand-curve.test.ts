import { expect, it } from 'vitest';
import { buildDrawingStrokeOutline } from './freehand';

it('rounds a fast circle sampled at wide intervals for pencil and marker previews', () => {
  const radius = 60;
  const samples = Array.from({ length: 9 }, (_, index) => {
    const angle = (index * Math.PI) / 4;
    return { x: 100 + Math.cos(angle) * radius, y: 100 + Math.sin(angle) * radius, t: index * 4 };
  });
  const midpointAngle = Math.PI / 8;
  for (const dynamicWidth of [false, true]) {
    for (const preview of [false, true]) {
      const outline = buildDrawingStrokeOutline(samples, 2, {
        dynamicWidth,
        preview,
        smoothingLevel: preview ? 4 : 10,
      });
      const midpointRadius = Math.max(
        ...outline
          .filter((point) => {
            const angle = Math.atan2(point.y - 100, point.x - 100);
            return Math.abs(angle - midpointAngle) < Math.PI / 48;
          })
          .map((point) => Math.hypot(point.x - 100, point.y - 100))
      );
      expect(midpointRadius).toBeGreaterThan(preview ? 58.5 : 59);
    }
  }
});

it('preserves an intentional right-angle corner', () => {
  const corner = buildDrawingStrokeOutline(
    [
      { x: 0, y: 0, t: 0 },
      { x: 40, y: 0, t: 4 },
      { x: 40, y: 40, t: 8 },
    ],
    2,
    { dynamicWidth: false, smoothingLevel: 10 }
  );
  expect(corner.some((point) => Math.hypot(point.x - 40, point.y) < 4)).toBe(true);
});
