import { expect, it } from 'vitest';
import {
  scaleAnnotationLength,
  scaleAnnotationInteractionLength,
  scaleAnnotationPoint,
  scaleAnnotationRect,
} from './scale';

it('keeps annotation content scaling continuous while preserving an interaction floor', () => {
  expect(scaleAnnotationLength(20, 0.1)).toBe(2);
  expect(scaleAnnotationInteractionLength(20, 0.1)).toBe(4);
  expect(scaleAnnotationPoint({ x: 12, y: 18 }, 2)).toEqual({ x: 24, y: 36 });
  expect(scaleAnnotationRect({ height: 8, width: 10, x: 4, y: 6 }, 1.5)).toEqual({
    height: 12,
    width: 15,
    x: 6,
    y: 9,
  });
});
