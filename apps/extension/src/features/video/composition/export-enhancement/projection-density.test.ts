import { it } from 'vitest';
import assert from 'node:assert/strict';
import { projectedDensityBound, samplingRasterSize } from './projection-density';
it('3D density keeps rotation neutral and composes flat click-lens magnification', () => {
  const roi = { x: 0, y: 0, width: 100, height: 50 };
  const rotation = [0, -1, 10, 1, 0, 15, 0, 0, 1];
  assert.equal(projectedDensityBound(rotation, roi), 1);
  assert.deepEqual(samplingRasterSize({ roi, projection: rotation, lensScale: 2 }), {
    density: 2,
    width: 200,
    height: 100,
  });
  assert.throws(() => projectedDensityBound([1, 0, 0, 0, 1, 0, -0.02, 0, 1], roi), /horizon/);
});

it('perspective bound contains observed source-to-output differential scales', () => {
  const roi = { x: 10, y: 10, width: 200, height: 120 };
  const matrix = [1.3, 0.2, 20, -0.1, 1.1, 4, -0.001, 0.0004, 1] as const;
  const bound = projectedDensityBound(matrix, roi);
  const project = (x: number, y: number) => {
    const w = matrix[6] * x + matrix[7] * y + matrix[8];
    return [
      (matrix[0] * x + matrix[1] * y + matrix[2]) / w,
      (matrix[3] * x + matrix[4] * y + matrix[5]) / w,
    ];
  };
  // Независимая численная проверка нескольких направлений, шаг меньше 1/1000 пикселя.
  for (let x = 10; x <= 210; x += 20)
    for (let y = 10; y <= 130; y += 20)
      for (let n = 0; n < 12; n++) {
        const angle = (n * Math.PI) / 6,
          p = project(x, y),
          q = project(x + 1e-4 * Math.cos(angle), y + 1e-4 * Math.sin(angle));
        assert.ok(Math.hypot(q[0]! - p[0]!, q[1]! - p[1]!) / 1e-4 <= bound + 1e-5);
      }
});
