import { expect, it } from 'vitest';
import { LIBRARY_STORAGE_CLASSES } from './library-lifecycle';

it('exposes the two stable lifecycle storage classes', () => {
  expect(LIBRARY_STORAGE_CLASSES).toEqual(['temporary', 'library']);
});
