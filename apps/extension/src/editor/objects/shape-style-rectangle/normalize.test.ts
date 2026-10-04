import { Ellipse, Triangle } from 'fabric';
import { expect, it } from 'vitest';
import { normalizeScaledRectangleTarget } from './normalize';

it.each([Ellipse, Triangle])('does not normalize a scaled non-rectangle shape', (Shape) => {
  const options = {
    height: 100,
    rx: 50,
    ry: 50,
    scaleX: 1.5,
    scaleY: 0.75,
    sniptaleRole: 'annotation',
    sniptaleType: 'shape',
    width: 100,
  } as const;
  const object = Shape === Ellipse ? new Ellipse(options) : new Triangle(options);

  expect(normalizeScaledRectangleTarget(object)).toBe(false);
  expect(object.scaleX).toBe(1.5);
  expect(object.scaleY).toBe(0.75);
});
