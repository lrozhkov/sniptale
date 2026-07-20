import { expect, it } from 'vitest';
import { translatePointsToObjectPosition, translateSamplesToObjectPosition } from './position';

it('translates points and samples from path-offset space into object position', () => {
  const object = { left: 15, pathOffset: { x: 5, y: 6 }, top: 20 };

  expect(translatePointsToObjectPosition(object as never, [{ x: 1, y: 2 }])).toEqual([
    { x: 11, y: 16 },
  ]);
  expect(translateSamplesToObjectPosition(object as never, [{ t: 3, x: 1, y: 2 }])).toEqual([
    { t: 3, x: 11, y: 16 },
  ]);
});

it('leaves coordinates unchanged when object position data is incomplete', () => {
  expect(translatePointsToObjectPosition({} as never, [{ x: 1, y: 2 }])).toEqual([{ x: 1, y: 2 }]);
  expect(translateSamplesToObjectPosition({} as never, null)).toBeNull();
});
