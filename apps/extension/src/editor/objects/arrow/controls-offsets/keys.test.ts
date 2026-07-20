import { expect, it } from 'vitest';

import { getArrowControlKey, getArrowEndpointIndex } from './keys';

it('maps arrow display indexes to control keys and endpoint indexes', () => {
  expect(getArrowControlKey(0, 3)).toBe('start');
  expect(getArrowControlKey(1, 3)).toBe('point-1');
  expect(getArrowControlKey(2, 3)).toBe('end');

  expect(getArrowEndpointIndex(0, 3)).toBe(0);
  expect(getArrowEndpointIndex(1, 3)).toBeNull();
  expect(getArrowEndpointIndex(2, 3)).toBe(2);
});
