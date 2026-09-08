import { expect, it } from 'vitest';
import {
  mapEffectV1ObjectPoint,
  mapEffectV1ScenePoint,
  resolveEffectV1ObjectRenderBounds,
} from './geometry';
const layout = {
  width: 380,
  height: 120,
  resize: 'scale' as const,
  handles: [
    {
      id: 'tip',
      label: { en: 'Tip', ru: 'Точка' },
      xControl: 'anchorX',
      yControl: 'anchorY',
      padding: 16,
    },
  ],
};
it.each([0, Math.PI / 2, -Math.PI / 2, Math.PI, 0.37])(
  'keeps a scene point through inverse body transform at rotation %s',
  (rotation) => {
    for (const scale of [0.25, 1, 2]) {
      const placement = { x: 600, y: 400, width: 380 * scale, height: 120 * scale, rotation };
      for (const point of [
        { x: 0, y: 0 },
        { x: 1920, y: 0 },
        { x: 0, y: 1080 },
        { x: 1920, y: 1080 },
        { x: 700, y: 450 },
      ]) {
        const local = mapEffectV1ScenePoint(layout, placement, point);
        const restored = mapEffectV1ObjectPoint(layout, placement, local);
        expect(restored.x).toBeCloseTo(point.x, 8);
        expect(restored.y).toBeCloseTo(point.y, 8);
      }
    }
  }
);
it('grows only raster bounds for negative and distant anchors', () => {
  expect(resolveEffectV1ObjectRenderBounds(layout, { anchorX: -100, anchorY: -50 })).toEqual({
    x: -116,
    y: -66,
    width: 496,
    height: 186,
  });
  expect(resolveEffectV1ObjectRenderBounds(layout, { anchorX: 100, anchorY: 60 })).toEqual({
    x: 0,
    y: 0,
    width: 380,
    height: 120,
  });
  expect(() =>
    resolveEffectV1ObjectRenderBounds(layout, { anchorX: 1_000_001, anchorY: 0 })
  ).toThrow();
});
