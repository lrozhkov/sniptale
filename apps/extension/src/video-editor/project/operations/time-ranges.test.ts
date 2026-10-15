import { expect, it } from 'vitest';
import { mergeTimeRanges } from './time-ranges';

it('merges adjacent ranges without reading image signals', () => {
  expect(
    mergeTimeRanges(
      [
        { startTime: 0, endTime: 1 },
        { startTime: 1.05, endTime: 2 },
        { startTime: 4, endTime: 5 },
      ],
      0.1
    )
  ).toEqual([
    { startTime: 0, endTime: 2 },
    { startTime: 4, endTime: 5 },
  ]);
});
