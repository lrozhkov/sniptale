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
