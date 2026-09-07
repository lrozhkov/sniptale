// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { resolveTimelineTimeFromClientX } from './seek';

it('uses the precise viewport origin rather than the coarse scrollbar position', () => {
  const node = document.createElement('div');
  node.scrollLeft = 15000000;
  const start = 43200 + 1 / 240;
  expect(resolveTimelineTimeFromClientX(node, 96, 23040, start)).toBeCloseTo(start + 1 / 240, 10);
});
