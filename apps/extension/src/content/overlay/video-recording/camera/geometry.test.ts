import { describe, expect, it } from 'vitest';
import {
  constrainEmbeddedCameraGeometry,
  DEFAULT_EMBEDDED_CAMERA_GEOMETRY,
  resizeEmbeddedCameraGeometry,
} from './geometry';

describe('embedded recording camera geometry', () => {
  it('keeps the complete fixed-ratio camera inside the viewport', () => {
    const constrained = constrainEmbeddedCameraGeometry(
      {
        ...DEFAULT_EMBEDDED_CAMERA_GEOMETRY,
        center: { x: 1, y: 1 },
        cropOffset: { x: 4, y: -4 },
        shape: 'rectangle',
        sizeFraction: 0.8,
      },
      { width: 1200, height: 800 }
    );

    expect(constrained.sizeFraction).toBe(0.55);
    expect(constrained.center.x).toBeLessThan(1);
    expect(constrained.center.y).toBeLessThan(1);
    expect(constrained.cropOffset).toEqual({ x: 1, y: -1 });
  });

  it.each([
    ['nw', { x: -80, y: -80 }],
    ['ne', { x: 80, y: -80 }],
    ['se', { x: 80, y: 80 }],
    ['sw', { x: -80, y: 80 }],
  ] as const)('grows from the %s corner without changing the shape ratio', (corner, delta) => {
    const resized = resizeEmbeddedCameraGeometry(DEFAULT_EMBEDDED_CAMERA_GEOMETRY, corner, delta, {
      width: 1200,
      height: 800,
    });

    expect(resized.sizeFraction).toBeCloseTo(0.32);
    expect(resized.shape).toBe('circle');
  });
});
