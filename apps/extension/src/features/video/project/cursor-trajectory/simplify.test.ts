import { expect, it } from 'vitest';
import {
  createCursorTrajectoryWindowRecorder,
  simplifyCursorTrajectoryWindow,
  type CursorTrajectoryObservation,
} from './simplify';

function sample(
  observationSeq: number,
  activeTimeUs: number,
  xQ8: number,
  yQ8 = 0,
  options: Partial<CursorTrajectoryObservation> = {}
): CursorTrajectoryObservation {
  return {
    observationSeq,
    activeTimeUs,
    xQ8,
    yQ8,
    segmentId: 0,
    observed: true,
    visible: true,
    event: 'move',
    anchors: [],
    ...options,
  };
}

// These hand-computed cases also appear in the proposed Desktop shared vectors.
it.each([
  {
    name: 'constant speed',
    input: [
      [0, 0, 0],
      [50000, 1280, 0],
      [100000, 2560, 0],
    ],
    kept: [0, 2],
  },
  {
    name: 'time error on a straight line',
    input: [
      [0, 0, 0],
      [1000, 2560, 0],
      [100000, 2816, 0],
    ],
    kept: [0, 1, 2],
  },
  {
    name: '509 Q8 below threshold',
    input: [
      [0, 0, 0],
      [50000, 1280, 509],
      [100000, 2560, 0],
    ],
    kept: [0, 2],
  },
  {
    name: '510 Q8 above threshold',
    input: [
      [0, 0, 0],
      [50000, 1280, 510],
      [100000, 2560, 0],
    ],
    kept: [0, 1, 2],
  },
  {
    name: 'equal error chooses smaller sequence',
    input: [
      [0, 0, 0],
      [25000, 640, 768],
      [50000, 1280, 768],
      [100000, 2560, 0],
    ],
    kept: [0, 1, 3],
  },
])('preserves $name', ({ input, kept }) => {
  const observations = input.map(([time, x, y], seq) => sample(seq, time!, x!, y!));
  const before = structuredClone(observations);
  expect(simplifyCursorTrajectoryWindow(observations).map((point) => point.observationSeq)).toEqual(
    kept
  );
  expect(observations).toEqual(before);
});

it.each(['down', 'up', 'click'] as const)('retains %s and its exact neighbors', (event) => {
  const input = Array.from({ length: 7 }, (_, index) =>
    sample(index, index * 20000, index * 256, 0, index === 3 ? { event } : {})
  );
  expect(simplifyCursorTrajectoryWindow(input).map((point) => point.observationSeq)).toEqual([
    0, 2, 3, 4, 6,
  ]);
});

it('preserves equal-time positions, segment boundaries and unavailable observations', () => {
  const input = [
    sample(0, 0, 0),
    sample(1, 1000, 256),
    sample(2, 1000, 512, 0, { segmentId: 1 }),
    sample(3, 2000, 0, 0, { segmentId: 1, xQ8: null, yQ8: null, observed: false, visible: false }),
    sample(4, 3000, 768, 0, { segmentId: 2 }),
    sample(5, 4000, 1024, 0, { segmentId: 2 }),
  ];
  expect(simplifyCursorTrajectoryWindow(input)).toEqual(input);
});

it('partitions source windows by time and count without duplicating a carry endpoint', () => {
  const recorder = createCursorTrajectoryWindowRecorder();
  const output: CursorTrajectoryObservation[] = [];
  for (let seq = 0; seq < 1025; seq += 1) output.push(...recorder.append(sample(seq, seq, seq)));
  expect(recorder.pendingCount()).toBeLessThanOrEqual(512);
  output.push(...recorder.append(sample(1025, 1000000, 1025)));
  output.push(...recorder.flush());
  expect(output.map((point) => point.observationSeq)).toEqual([0, 511, 1022, 1024, 1025]);
  expect(recorder.flush()).toEqual([]);
  expect(recorder.pendingCount()).toBe(0);
});

it('retains button neighbors across count flush and accepts equal-time boundaries', () => {
  const recorder = createCursorTrajectoryWindowRecorder();
  const output: CursorTrajectoryObservation[] = [];
  for (let seq = 0; seq < 512; seq += 1) output.push(...recorder.append(sample(seq, seq, seq)));
  output.push(...recorder.append(sample(512, 512, 512, 0, { event: 'down' })));
  output.push(...recorder.append(sample(513, 513, 513)));
  output.push(...recorder.append(sample(514, 513, 514, 0, { segmentId: 1 })));
  output.push(...recorder.flush());
  expect(output.map((point) => point.observationSeq)).toEqual([0, 511, 512, 513, 514]);
});

it('carries a time-window endpoint when it still fits, without preserving an unnecessary move', () => {
  const recorder = createCursorTrajectoryWindowRecorder();
  const output = [
    ...recorder.append(sample(0, 0, 0)),
    ...recorder.append(sample(1, 250000, 0)),
    ...recorder.append(sample(2, 250001, 256)),
    ...recorder.append(sample(3, 250002, 512)),
    ...recorder.flush(),
  ];
  expect(output.map((point) => point.observationSeq)).toEqual([0, 1, 3]);
});

it('streams one hour without a lifetime count limit or retaining previous windows', () => {
  const recorder = createCursorTrajectoryWindowRecorder();
  let retained = 0;
  let maximumPending = 0;
  let firstBatch: CursorTrajectoryObservation[] | null = null;
  let firstBatchBefore: CursorTrajectoryObservation[] | null = null;
  for (let seq = 0; seq <= 360000; seq += 1) {
    const output = recorder.append(sample(seq, seq * 10000, 25600, 25600 + (seq % 2) * 1024));
    retained += output.length;
    maximumPending = Math.max(maximumPending, recorder.pendingCount());
    if (output.length > 0 && firstBatch === null) {
      firstBatch = output;
      firstBatchBefore = structuredClone(output);
    }
  }
  retained += recorder.flush().length;
  expect(retained).toBeGreaterThan(4096);
  expect(maximumPending).toBeLessThanOrEqual(512);
  expect(firstBatch).toEqual(firstBatchBefore);
  expect(recorder.pendingCount()).toBe(0);
});

it('meets the distance bound at every input time using an independent interpolation oracle', () => {
  const input = Array.from({ length: 501 }, (_, index) =>
    sample(
      index,
      index * 500,
      Math.round(index ** 2 / 10),
      Math.round(10000 + 3000 * Math.sin(index / 19))
    )
  );
  const output = simplifyCursorTrajectoryWindow(input);
  expect(output.length).toBeLessThan(input.length);
  let interval = 0;
  for (const point of input) {
    while (
      interval + 1 < output.length - 1 &&
      output[interval + 1]!.activeTimeUs < point.activeTimeUs
    )
      interval += 1;
    const left = output[interval]!;
    const right = output[interval + 1]!;
    const fraction =
      (point.activeTimeUs - left.activeTimeUs) / (right.activeTimeUs - left.activeTimeUs);
    const x = left.xQ8! + fraction * (right.xQ8! - left.xQ8!);
    const y = left.yQ8! + fraction * (right.yQ8! - left.yQ8!);
    expect(Math.hypot(point.xQ8! - x, point.yQ8! - y) / 256).toBeLessThanOrEqual(1.99 + 1e-10);
  }
});

it('compares large safe integers exactly without Number product rounding', () => {
  const origin = Number.MAX_SAFE_INTEGER - 100000;
  const input = [
    sample(0, origin, origin),
    sample(1, origin + 50000, origin + 1280, 510),
    sample(2, origin + 100000, origin + 2560),
  ];
  expect(simplifyCursorTrajectoryWindow(input)).toEqual(input);
});

it('rejects invalid windows before simplification and retains explicit lifecycle anchors', () => {
  expect(simplifyCursorTrajectoryWindow([])).toEqual([]);
  expect(() =>
    simplifyCursorTrajectoryWindow(Array.from({ length: 513 }, (_, seq) => sample(seq, seq, 0)))
  ).toThrow(RangeError);
  expect(() => simplifyCursorTrajectoryWindow([sample(0, 0, 0), sample(1, 250001, 0)])).toThrow(
    RangeError
  );
  for (const value of [NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => simplifyCursorTrajectoryWindow([sample(0, 0, value)])).toThrow(RangeError);
  }
  expect(() => simplifyCursorTrajectoryWindow([sample(1, 0, 0), sample(1, 1, 0)])).toThrow(
    RangeError
  );
  expect(() => simplifyCursorTrajectoryWindow([sample(0, 2, 0), sample(1, 1, 0)])).toThrow(
    RangeError
  );
  const input = [sample(0, 0, 0), sample(1, 1, 1, 0, { anchors: ['pause'] }), sample(2, 2, 2)];
  expect(simplifyCursorTrajectoryWindow(input)).toEqual(input);
});
