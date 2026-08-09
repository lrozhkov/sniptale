import { expect, it } from 'vitest';
import { reorderPaletteBefore } from './model';

it('reorders editor palette families and rejects missing source colors', () => {
  const palette = {
    shapeStroke: ['a', 'b', 'c'],
    shapeFill: [],
    textColor: [],
    textBackground: [],
    sceneBackground: [],
  };
  expect(
    reorderPaletteBefore({ itemIndex: 0, beforeIndex: 2, key: 'shapeStroke', palette })?.shapeStroke
  ).toEqual(['b', 'a', 'c']);
  expect(
    reorderPaletteBefore({ itemIndex: 2, beforeIndex: 0, key: 'shapeStroke', palette })?.shapeStroke
  ).toEqual(['c', 'a', 'b']);
  expect(
    reorderPaletteBefore({ itemIndex: 0, beforeIndex: null, key: 'shapeStroke', palette })
      ?.shapeStroke
  ).toEqual(['b', 'c', 'a']);
  expect(
    reorderPaletteBefore({ itemIndex: 9, beforeIndex: null, key: 'shapeStroke', palette })
  ).toBeNull();
});
