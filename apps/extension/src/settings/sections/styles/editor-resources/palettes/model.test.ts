import { expect, it } from 'vitest';
import { reorderPalette } from './model';

it('reorders one palette without mutating the source', () => {
  const palette = {
    shapeStroke: ['#1', '#2'],
    shapeFill: [],
    textColor: [],
    textBackground: [],
    sceneBackground: [],
  };
  expect(
    reorderPalette({ draggedIndex: 0, palette, key: 'shapeStroke', targetIndex: 1 })?.shapeStroke
  ).toEqual(['#2', '#1']);
  expect(palette.shapeStroke).toEqual(['#1', '#2']);
});
