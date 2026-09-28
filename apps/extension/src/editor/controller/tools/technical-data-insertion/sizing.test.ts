import { expect, it } from 'vitest';
import { getTechnicalDataTextWidth } from './sizing';

it('uses the full available width for rows and a bounded width for columns', () => {
  expect(getTechnicalDataTextWidth('row', 2960)).toBe(2960);
  expect(getTechnicalDataTextWidth('column', 2960)).toBe(640);
  expect(getTechnicalDataTextWidth('row', 240)).toBe(240);
  expect(getTechnicalDataTextWidth('column', 240)).toBe(240);
});
