import { expect, it } from 'vitest';
import type { ArrowPathInstance } from './controls.types';
import {
  getArrowControlKey,
  getArrowEndpointIndex,
  getEditableArrowPoints,
  getStoredArrowPointIndex,
  resolveArrowStoredPointFromControl,
} from './controls-offsets';
import { readArrowPoints } from './controls-points';
import { readArrowSettings } from './settings';

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

it('owns editable control keys, endpoint indexes, and endpoint display offsets', () => {
  const arrow = createArrow();

  expect(getArrowControlKey(0, 3)).toBe('start');
  expect(getArrowControlKey(1, 3)).toBe('point-1');
  expect(getArrowControlKey(2, 3)).toBe('end');
  expect(getArrowEndpointIndex(1, 3)).toBeNull();
  expect(getEditableArrowPoints(arrow)).toEqual([
    { x: -12, y: 0 },
    { x: 52, y: 0 },
  ]);
});

it('maps display indexes back to stored points and resolves offset handles', () => {
  const arrow = createArrow({
    sniptaleArrowControlX: 20,
    sniptaleArrowControlY: 30,
  });
  const points = readArrowPoints(arrow);
  const settings = readArrowSettings(arrow);

  expect(getStoredArrowPointIndex(settings, points, 1)).toBe(2);
  expect(
    resolveArrowStoredPointFromControl(
      { ...settings, width: 4 },
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
      ],
      1,
      {
        x: -28,
        y: 0,
      }
    )
  ).toEqual({ x: -22, y: 0 });
});
