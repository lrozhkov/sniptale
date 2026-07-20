import { expect, it } from 'vitest';

import { createShapeStrokeDashArray } from './shape-style-dash';

it('derives stroke dash arrays from shape stroke style and width', () => {
  expect(createShapeStrokeDashArray('solid', 4)).toBeUndefined();
  expect(createShapeStrokeDashArray('dashed', 3)).toEqual([10, 6]);
  expect(createShapeStrokeDashArray('dotted', 2)).toEqual([2, 6]);
});
