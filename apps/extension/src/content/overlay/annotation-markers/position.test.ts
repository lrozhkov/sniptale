// @vitest-environment jsdom

import { expect, it } from 'vitest';
import { clampMarkerOffset } from './position';

function createTarget(): Element {
  const target = document.createElement('div');
  const rect = DOMRect.fromRect({ height: 40, width: 80, x: 100, y: 100 });
  Object.defineProperty(target, 'getBoundingClientRect', { value: () => rect });
  document.body.append(target);
  return target;
}

it('keeps a dragged marker within a small corridor around its target', () => {
  const target = createTarget();

  expect(clampMarkerOffset(target, { x: 10_000, y: 10_000 })).toEqual({ x: 28, y: 36 });
  expect(clampMarkerOffset(target, { x: -10_000, y: -10_000 })).toEqual({ x: -84, y: -4 });
});
