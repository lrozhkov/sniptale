import { expect, it } from 'vitest';

import { addPixelToComponentBounds } from './component-bounds';

it('updates component area and inclusive pixel bounds', () => {
  const component = { area: 1, maxX: 4, maxY: 5, minX: 4, minY: 5 };

  addPixelToComponentBounds(component, 2, 8);

  expect(component).toEqual({ area: 2, maxX: 4, maxY: 8, minX: 2, minY: 5 });
});
