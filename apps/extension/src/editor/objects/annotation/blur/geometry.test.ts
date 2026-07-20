import { expect, it } from 'vitest';

import { expandBlurAreaBounds, resolveBlurAreaBounds } from './geometry';

it('keeps blur object bounds as the blur area when the visible frame is enabled', () => {
  const area = { height: 20, left: 10, top: 12, width: 40 };
  const framed = expandBlurAreaBounds(area);

  expect(framed).toEqual(area);
  expect(resolveBlurAreaBounds(framed as never)).toEqual(area);
  expect(
    resolveBlurAreaBounds({ height: 0.2, left: undefined, top: undefined, width: 0 } as never)
  ).toEqual({
    height: 1,
    left: 0,
    top: 0,
    width: 1,
  });
});
