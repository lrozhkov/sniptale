import { expect, it } from 'vitest';
import type { ArrowPathInstance } from './controls.types';
import { readArrowAuthoredPoints, readArrowGeometry, readArrowPoints } from './controls-points';

function createArrow(overrides: Partial<ArrowPathInstance> = {}): ArrowPathInstance {
  return {
    sniptaleArrowEndX: 30,
    sniptaleArrowEndY: 40,
    sniptaleArrowStartX: 10,
    sniptaleArrowStartY: 20,
    ...overrides,
  } as ArrowPathInstance;
}

it('owns authored arrow point reads and normalized geometry output', () => {
  const arrow = createArrow({
    sniptaleArrowMode: 'curve',
    sniptaleArrowPointsJson: JSON.stringify([
      { x: 10, y: 20 },
      { x: 50, y: 60 },
    ]),
  });

  expect(readArrowAuthoredPoints(arrow)).toEqual([
    { x: 10, y: 20 },
    { x: 50, y: 60 },
  ]);
  const points = readArrowPoints(arrow);
  expect(points).toHaveLength(3);
  expect(readArrowGeometry(arrow)).toEqual({
    control: points[1],
    end: { x: 50, y: 60 },
    start: { x: 10, y: 20 },
  });
});

it('falls back to legacy start, control, and end metadata', () => {
  expect(
    readArrowAuthoredPoints(
      createArrow({
        sniptaleArrowControlX: 20,
        sniptaleArrowControlY: 30,
      })
    )
  ).toEqual([
    { x: 10, y: 20 },
    { x: 20, y: 30 },
    { x: 30, y: 40 },
  ]);
});
