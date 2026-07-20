import { expect, it } from 'vitest';
import {
  getElbowSegmentMidpoint,
  isElbowInternalSegment,
  moveElbowSegment,
  normalizeElbowPoints,
} from './elbow';
import {
  getEffectiveArrowMode,
  hasArrowCurvePointEditing,
  isTaperedArrowVariant,
  resolveArrowInteractionAppearance,
} from './variant';

function createSettings(overrides: Partial<Parameters<typeof getEffectiveArrowMode>[0]>) {
  return {
    arrowType: 'sharp',
    color: '#111',
    endHead: 'triangle',
    mode: 'straight',
    opacity: 1,
    shadow: 0,
    startHead: 'none',
    variant: 'standard',
    width: 4,
    ...overrides,
  } as Parameters<typeof getEffectiveArrowMode>[0];
}

it('builds a centered orthogonal route for diagonal endpoints', () => {
  expect(
    normalizeElbowPoints([
      { x: 0, y: 0 },
      { x: 100, y: 40 },
    ])
  ).toEqual([
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 50, y: 40 },
    { x: 100, y: 40 },
  ]);
});

it('keeps the terminal segment on the dominant endpoint axis', () => {
  expect(
    normalizeElbowPoints([
      { x: 0, y: 0 },
      { x: 100, y: 20 },
    ])
  ).toEqual([
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 50, y: 20 },
    { x: 100, y: 20 },
  ]);
  expect(
    normalizeElbowPoints([
      { x: 0, y: 0 },
      { x: 20, y: 100 },
    ]).at(-2)
  ).toEqual({ x: 20, y: 50 });
});

it('keeps collapsed draft endpoints as two points while an elbow arrow is being drawn', () => {
  expect(
    normalizeElbowPoints([
      { x: 12, y: 14 },
      { x: 12, y: 14 },
    ])
  ).toEqual([
    { x: 12, y: 14 },
    { x: 12, y: 14 },
  ]);
});

it('exposes only internal segment midpoints as editable elbow route handles', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 50, y: 40 },
    { x: 100, y: 40 },
  ];

  expect(isElbowInternalSegment(points, 1)).toBe(false);
  expect(isElbowInternalSegment(points, 2)).toBe(true);
  expect(isElbowInternalSegment(points, 3)).toBe(false);
  expect(getElbowSegmentMidpoint(points, 2)).toEqual({ x: 50, y: 20 });
});

it('moves an internal segment on its locked axis and keeps the route orthogonal', () => {
  const moved = moveElbowSegment(
    [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 40 },
      { x: 100, y: 40 },
    ],
    2,
    { x: 70, y: 25 }
  );

  expect(moved).toEqual([
    { x: 0, y: 0 },
    { x: 70, y: 0 },
    { x: 70, y: 40 },
    { x: 100, y: 40 },
  ]);
});

it('keeps elbow arrows in straight editing mode even when legacy mode is curve', () => {
  const cases = [
    [{ arrowType: 'elbow', mode: 'curve' }, 'straight'],
    [{ arrowType: 'curved', mode: 'straight' }, 'curve'],
    [{ arrowType: 'sharp', mode: 'curve' }, 'curve'],
    [{ arrowType: 'elbow', mode: 'straight' }, 'straight'],
    [{ arrowType: 'sharp', mode: 'straight' }, 'straight'],
  ] as const;

  for (const [settings, expected] of cases) {
    expect(getEffectiveArrowMode(createSettings(settings))).toBe(expected);
  }
});

it('keeps variant interaction helpers covered for arrow settings', () => {
  const standard = createSettings({
    arrowType: 'sharp',
    color: '#111',
    endHead: 'triangle',
    mode: 'straight',
    opacity: 1,
    shadow: 0,
    startHead: 'none',
    variant: 'standard',
    width: 4,
  });
  const tapered = { ...standard, variant: 'tapered' as const };

  expect(isTaperedArrowVariant(standard)).toBe(false);
  expect(isTaperedArrowVariant(tapered)).toBe(true);
  expect(hasArrowCurvePointEditing(standard)).toBe(true);
  expect(hasArrowCurvePointEditing(tapered)).toBe(true);
  expect(resolveArrowInteractionAppearance(standard).lockScaling).toBe(true);
  expect(resolveArrowInteractionAppearance(tapered).cornerStyle).toBe('circle');
});
