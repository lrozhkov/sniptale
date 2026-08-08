import { expect, it } from 'vitest';
import { reorderPaletteBefore } from './model';

it('reorders one palette without mutating the source', () => {
  const palette = {
    shapeStroke: ['#1', '#2'],
    shapeFill: [],
    textColor: [],
    textBackground: [],
    sceneBackground: [],
  };
  expect(
    reorderPaletteBefore({ itemIndex: 0, beforeIndex: null, palette, key: 'shapeStroke' })
      ?.shapeStroke
  ).toEqual(['#2', '#1']);
  expect(palette.shapeStroke).toEqual(['#1', '#2']);
  expect(
    reorderPaletteBefore({ itemIndex: 9, beforeIndex: null, palette, key: 'shapeStroke' })
  ).toBeNull();
  expect(
    reorderPaletteBefore({ itemIndex: 0, beforeIndex: 1, palette, key: 'shapeStroke' })?.shapeStroke
  ).toEqual(['#1', '#2']);
});
