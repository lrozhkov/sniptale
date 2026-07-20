import { expect, it } from 'vitest';
import { RecordingTelemetrySignalKind } from '../../../features/video/project/types/interaction';
import { buildStableSignalIntersections, mergeTimeRanges } from './time-ranges';

it('merges adjacent ranges and builds stable signal intersections', () => {
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

  expect(
    buildStableSignalIntersections([
      {
        data: { dwellMs: 1000 },
        endTime: 3,
        id: 'idle',
        kind: RecordingTelemetrySignalKind.CURSOR_IDLE,
        point: null,
        startTime: 1,
      },
      {
        data: { maxDiff: 0.1 },
        endTime: 4,
        id: 'static',
        kind: RecordingTelemetrySignalKind.STATIC_FRAME,
        point: null,
        startTime: 2,
      },
    ])
  ).toEqual([{ startTime: 2, endTime: 3 }]);
});
