import { expect, it } from 'vitest';
import { createExportTimeEstimator, planExportTimeWork } from './time-estimate';

function machine(multiplier: number, heavy = false) {
  let clock = 0;
  const estimator = createExportTimeEstimator(
    [
      { start: 0, end: 5, cost: 1 },
      { start: 5, end: 10, cost: heavy ? 3 : 1 },
    ],
    () => clock
  );
  for (let frame = 1; frame <= 60; frame++) {
    clock += 100 * multiplier;
    estimator.observe(frame / 30);
  }
  return estimator.snapshot()!.remainingMs;
}

it('predicts a heavier late section before reaching it and measures the current machine', () => {
  expect(machine(1, true)).toBeGreaterThan(machine(1));
  expect(machine(2)).toBeCloseTo(machine(1) * 2, 4);
});

it('waits for evidence and clears at the real end rather than emitting a premature zero', () => {
  let clock = 0;
  const estimator = createExportTimeEstimator([{ start: 4, end: 8, cost: 1 }], () => clock);
  expect(estimator.snapshot()).toBeNull();
  for (let i = 1; i <= 3; i++) {
    clock += 600;
    estimator.observe(4 + i / 2);
  }
  expect(estimator.snapshot()?.remainingMs).toBeGreaterThan(0);
  clock += 3000;
  expect(estimator.observe(8)).toBeNull();
  expect(estimator.observe(NaN)).toBeNull();
});

it('excludes separately timed audio and includes its measured remaining cost', () => {
  let clock = 0;
  const estimator = createExportTimeEstimator([{ start: 0, end: 10, cost: 1 }], () => clock);
  for (let i = 1; i <= 3; i++) {
    clock += 1000;
    estimator.observe(i);
  }
  const before = estimator.snapshot()!.remainingMs;
  clock += 10000;
  estimator.resume();
  estimator.setAdditionalRemainingMs(2000);
  clock += 1000;
  estimator.observe(4);
  expect(estimator.snapshot()!.remainingMs).toBeCloseTo(before + 1000, 4);
});

it('bounds the plan independently of frame count while retaining short boundaries', () => {
  const small = planExportTimeWork(0, 100, [49, 49.1], (t) => (t >= 49 && t < 49.1 ? 4 : 1));
  expect(small).toContainEqual({ start: 49, end: 49.1, cost: 4 });
  expect(
    planExportTimeWork(
      0,
      10000,
      Array.from({ length: 10000 }, (_, i) => i),
      () => 1
    )
  ).toHaveLength(256);
});

it('adapts to slowing throughput and keeps invalid clock readings out of its estimate', () => {
  let clock = 0;
  const estimator = createExportTimeEstimator([{ start: 0, end: 100, cost: 1 }], () => clock);
  for (let i = 1; i <= 3; i++) {
    clock += 1000;
    estimator.observe(i);
  }
  const before = estimator.snapshot()!.remainingMs;
  for (let i = 4; i <= 8; i++) {
    clock += 3000;
    estimator.observe(i);
  }
  expect(estimator.snapshot()!.remainingMs).toBeGreaterThan(before);
  clock = NaN;
  expect(Number.isFinite(estimator.observe(9)!.remainingMs)).toBe(true);
});

it('retains a modest late complexity increase after learning normal frame cost', () => {
  let clock = 0;
  const estimator = createExportTimeEstimator(
    [
      { start: 0, end: 5, cost: 1 },
      { start: 5, end: 10, cost: 1.25 },
    ],
    () => clock
  );
  for (let i = 1; i <= 4; i++) {
    clock += 1000;
    estimator.observe(i);
  }
  expect(estimator.snapshot()!.remainingMs).toBeGreaterThan(6000);
  expect(estimator.snapshot()!.remainingMs).toBeLessThan(7000);
});

it('learns equal-cost routes separately instead of overwriting clean throughput with compositing', () => {
  let clock = 0;
  const estimator = createExportTimeEstimator(
    [
      { start: 0, end: 3, cost: 1, route: 'clean' },
      { start: 3, end: 6, cost: 1, route: 'composite' },
      { start: 6, end: 9, cost: 1, route: 'clean' },
    ],
    () => clock
  );
  for (let i = 1; i <= 3; i++) {
    clock += 1000;
    estimator.observe(i);
  }
  for (let i = 4; i <= 6; i++) {
    clock += 4000;
    estimator.observe(i);
  }
  expect(estimator.snapshot()!.remainingMs).toBeCloseTo(3000);
});

it('dilutes one slow initialization frame instead of retaining its per-frame rate', () => {
  let clock = 0;
  const estimator = createExportTimeEstimator([{ start: 0, end: 6, cost: 1 }], () => clock);
  clock = 700;
  estimator.observe(1 / 30);
  for (let frame = 2; frame <= 60; frame++) {
    clock += 35;
    estimator.observe(frame / 30);
  }
  const remaining = estimator.snapshot()!.remainingMs;
  expect(remaining).toBeGreaterThan(3500);
  expect(remaining).toBeLessThan(6000);
});

it('applies the optional calibration to snapshots and forwards warmup and completion nulls', () => {
  let clock = 0;
  const seen: Array<number | null> = [];
  const estimator = createExportTimeEstimator(
    [{ start: 0, end: 4, cost: 1 }],
    () => clock,
    (raw) => {
      seen.push(raw?.remainingMs ?? null);
      return raw ? { remainingMs: raw.remainingMs * 1.2 } : null;
    }
  );
  expect(estimator.snapshot()).toBeNull();
  for (let i = 1; i <= 3; i++) {
    clock += 1000;
    estimator.observe(i);
  }
  expect(estimator.snapshot()?.remainingMs).toBeCloseTo(1200);
  clock += 1000;
  expect(estimator.observe(4)).toBeNull();
  expect(seen[0]).toBeNull();
  expect(seen).toContain(1000);
  expect(seen.at(-1)).toBeNull();
});
