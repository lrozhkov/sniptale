import { expect, it } from 'vitest';
import { projectSourceFocusPhases } from './source-phase-projection';

const focus = {
  sourceStart: 0,
  sourceEnd: 8,
  enter: { type: 'linear' as const, duration: 3 },
  exit: { type: 'ease-in-out' as const, duration: 3 },
};

it('aggregates phase durations across contiguous rate changes and preserves source phases', () => {
  const spans = [
    { sourceStart: 0, sourceEnd: 2, start: 0, end: 1, rate: 2 },
    { sourceStart: 2, sourceEnd: 6, start: 1, end: 5, rate: 1 },
    { sourceStart: 6, sourceEnd: 8, start: 5, end: 9, rate: 0.5 },
  ];
  const projected = projectSourceFocusPhases(focus, spans);
  expect(projected).toHaveLength(1);
  expect(projected[0]).toMatchObject({
    start: 0,
    end: 9,
    enter: { type: 'linear', duration: 2 },
    exit: { type: 'ease-in-out', duration: 5 },
  });
  expect(focus.enter.duration).toBe(3);
  expect(focus.exit.duration).toBe(3);
  expect(projectSourceFocusPhases(focus, spans, { splitAtRates: true })).toMatchObject([
    { start: 0, end: 1, enter: { duration: 1 }, exit: { type: 'none', duration: 0 } },
    { start: 1, end: 5, enter: { type: 'none', duration: 0 }, exit: { type: 'none', duration: 0 } },
    { start: 5, end: 9, enter: { type: 'none', duration: 0 }, exit: { duration: 4 } },
  ]);
});

it('suppresses phases at source cuts even when result boundaries touch', () => {
  expect(
    projectSourceFocusPhases(focus, [
      { sourceStart: 0, sourceEnd: 2, start: 0, end: 2, rate: 1 },
      { sourceStart: 4, sourceEnd: 8, start: 2, end: 4, rate: 2 },
    ])
  ).toMatchObject([
    { start: 0, end: 2, enter: { duration: 2 }, exit: { type: 'none', duration: 0 } },
    { start: 2, end: 4, enter: { type: 'none', duration: 0 }, exit: { duration: 1.5 } },
  ]);
  expect(projectSourceFocusPhases(focus, [])).toEqual([]);
});

it('does not hold focus across a result gap between contiguous source intervals', () => {
  expect(
    projectSourceFocusPhases(focus, [
      { sourceStart: 0, sourceEnd: 4, start: 1, end: 5, rate: 1 },
      { sourceStart: 4, sourceEnd: 8, start: 7, end: 11, rate: 1 },
    ])
  ).toMatchObject([
    { start: 1, end: 5, enter: { duration: 3 }, exit: { type: 'none', duration: 0 } },
    { start: 7, end: 11, enter: { type: 'none', duration: 0 }, exit: { duration: 3 } },
  ]);
});
