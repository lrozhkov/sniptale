import { expect, it } from 'vitest';
import { evaluateCursorTrajectory } from './evaluate';
import type {
  CursorTrajectoryRecord,
  CursorTrajectorySample,
  CursorTrajectorySegment,
} from './types';

function segment(segmentId = 0, activeTimeUs = 100): CursorTrajectorySegment {
  return {
    kind: 'segment',
    segmentId,
    activeTimeUs,
    width: 100,
    height: 100,
    reason: segmentId ? 'after-gap' : 'start',
    clock: {
      source: 'dom-event-time',
      timestampQuantumUs: null,
      resolutionBoundUs: null,
      mappingUncertaintyUs: null,
    },
  };
}
function sample(
  observationSeq: number,
  activeTimeUs: number,
  x: number,
  segmentId = 0
): CursorTrajectorySample {
  return {
    kind: 'sample',
    segmentId,
    observationSeq,
    activeTimeUs,
    xQ8: x * 256,
    yQ8: 20 * 256,
    visible: true,
    observed: true,
    event: 'move',
    button: 'none',
    relatedObservationSeq: null,
    anchors: [],
  };
}
it('interpolates at the same source time and does not extrapolate an unfinished prefix', () => {
  const records = [segment(), sample(0, 100, 10), sample(1, 300, 90)];
  expect(evaluateCursorTrajectory(records, 200)).toEqual({
    segmentId: 0,
    observationSeq: 0,
    activeTimeUs: 200,
    x: 0.5,
    y: 0.2,
  });
  expect(evaluateCursorTrajectory(records, 99)).toBeNull();
  expect(evaluateCursorTrajectory(records, 300)?.x).toBe(0.9);
  expect(evaluateCursorTrajectory(records, 301)).toBeNull();
});
it('holds only inside an explicitly continuing interval and closes at the boundary', () => {
  const records: CursorTrajectoryRecord[] = [
    segment(),
    sample(0, 100, 10),
    { kind: 'boundary', segmentId: 0, activeTimeUs: 300, reason: 'stop' },
  ];
  expect(evaluateCursorTrajectory(records, 299)?.x).toBe(0.1);
  expect(evaluateCursorTrajectory(records, 300)).toBeNull();
  expect(evaluateCursorTrajectory(records, 301)).toBeNull();
});
it('does not interpolate through a gap or to another segment', () => {
  const records: CursorTrajectoryRecord[] = [
    segment(),
    sample(0, 100, 10),
    {
      kind: 'gap',
      segmentId: 0,
      fromTimeUs: 200,
      toTimeUs: 400,
      reason: 'source-unavailable',
      firstLostObservationSeq: null,
      lastLostObservationSeq: null,
    },
    segment(1, 400),
    sample(1, 400, 90, 1),
    sample(2, 500, 50, 1),
  ];
  expect(evaluateCursorTrajectory(records, 199)?.x).toBe(0.1);
  expect(evaluateCursorTrajectory(records, 200)).toBeNull();
  expect(evaluateCursorTrajectory(records, 399)).toBeNull();
  expect(evaluateCursorTrajectory(records, 450)?.x).toBe(0.7);
});
it('keeps the latest same-time segment without moving either timestamp', () => {
  const records: CursorTrajectoryRecord[] = [
    segment(),
    sample(0, 100, 10),
    { kind: 'boundary', segmentId: 0, activeTimeUs: 100, reason: 'zero-time-discontinuity' },
    segment(1, 100),
    sample(1, 100, 90, 1),
    sample(2, 200, 50, 1),
  ];
  expect(evaluateCursorTrajectory(records, 100)).toMatchObject({
    segmentId: 1,
    observationSeq: 1,
    x: 0.9,
  });
});
it('uses the admitted block context for a window that begins inside a segment', () => {
  expect(
    evaluateCursorTrajectory([sample(10, 100, 10), sample(11, 200, 90)], 150, segment())?.x
  ).toBe(0.5);
});
it.each([{ visible: false }, { observed: false, xQ8: null, yQ8: null }])(
  'hides an unavailable observation: %j',
  (change) => {
    const unavailable = { ...sample(1, 200, 90), ...change };
    const records = [segment(), sample(0, 100, 10), unavailable, sample(2, 300, 50)];
    expect(evaluateCursorTrajectory(records, 150)?.x).toBe(0.1);
    expect(evaluateCursorTrajectory(records, 200)).toBeNull();
    expect(evaluateCursorTrajectory(records, 250)).toBeNull();
  }
);
