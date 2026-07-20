import { expect, it } from 'vitest';

import type { ArrowPathInstance } from '../controls.types';
import { getEditableArrowPoints, getStoredArrowPointIndex } from './exposure';

function createArrow(overrides: Partial<ArrowPathInstance> = {}): ArrowPathInstance {
  return {
    sniptaleArrowEndX: 40,
    sniptaleArrowEndY: 0,
    sniptaleArrowStartX: 0,
    sniptaleArrowStartY: 0,
    sniptaleArrowWidth: 12,
    ...overrides,
  } as ArrowPathInstance;
}

it('exposes offset endpoints for straight arrows and all points for curves', () => {
  expect(getEditableArrowPoints(createArrow())).toEqual([
    { x: -12, y: 0 },
    { x: 52, y: 0 },
  ]);
  expect(
    getEditableArrowPoints(
      createArrow({
        sniptaleArrowControlX: 20,
        sniptaleArrowControlY: 10,
        sniptaleArrowMode: 'curve',
      })
    )
  ).toHaveLength(3);
});

it('maps display indexes to stored indexes based on exposure mode', () => {
  expect(
    getStoredArrowPointIndex(
      { mode: 'straight' } as never,
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      1
    )
  ).toBe(1);
  expect(
    getStoredArrowPointIndex(
      { mode: 'curve' } as never,
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      1
    )
  ).toBe(1);
});
