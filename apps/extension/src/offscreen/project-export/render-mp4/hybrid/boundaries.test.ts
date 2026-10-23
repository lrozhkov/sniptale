import { expect, it } from 'vitest';

import { collectTimelineBoundaries } from './boundaries';

it('collects export, clip, and transition boundaries inside the selected range', () => {
  const project = {
    duration: 10,
    clips: [
      { id: 'leading', startTime: 1, duration: 4 },
      { id: 'trailing', startTime: 4, duration: 3 },
      { id: 'outside', startTime: 9, duration: 1 },
    ],
    transitions: [
      {
        leadingClipId: 'leading',
        trailingClipId: 'trailing',
        duration: 1,
      },
    ],
  };

  expect(
    collectTimelineBoundaries(
      project as never,
      {
        rangeEndSeconds: 8,
        rangeStartSeconds: 2,
      } as never
    )
  ).toEqual([2, 3, 4, 5, 7, 8]);
});

it('adds effective join window edges within the export range and omits dormant boundaries', () => {
  const project = {
    duration: 4,
    clips: [{ id: 'intro', type: 'IMAGE', startTime: 0, duration: 2 }],
    compositionJoins: [
      {
        id: 'join',
        clipId: 'intro',
        edge: 'end',
        transition: { type: 'dissolve', before: 0.2, after: 0.3 },
      },
    ],
  };
  expect(collectTimelineBoundaries(project as never, {} as never)).toEqual([0, 1.8, 2, 2.3, 4]);
  expect(
    collectTimelineBoundaries(
      project as never,
      { rangeStartSeconds: 1.9, rangeEndSeconds: 2.2 } as never
    )
  ).toEqual([1.9, 2, 2.2]);
  expect(
    collectTimelineBoundaries(
      { ...project, compositionJoins: [{ id: 'join', clipId: 'intro', edge: 'end' }] } as never,
      {} as never
    )
  ).toEqual([0, 2, 4]);
});
