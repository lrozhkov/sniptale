import { expect, it } from 'vitest';
import { createExportTimeCalibration, createExportTimeProfile } from './time-calibration';

it('starts with a conservative reserve and reduces uncertainty without losing learned bias', () => {
  let clock = 0;
  const calibration = createExportTimeCalibration(() => clock);
  expect(calibration.estimate({ remainingMs: 100000 })?.remainingMs).toBe(120000);
  calibration.setHistory(Array(10).fill(1.5));
  clock = 90000;
  expect(calibration.estimate({ remainingMs: 10000 })?.remainingMs).toBeCloseTo(15300);
});

it('shrinks sparse history and ignores an isolated outlier in the last ten exports', () => {
  const calibration = createExportTimeCalibration(() => 0);
  calibration.setHistory([2]);
  expect(calibration.estimate({ remainingMs: 10000 })?.remainingMs).toBeCloseTo(13200);
  calibration.setHistory([4, 4, ...Array(9).fill(1), 4]);
  expect(calibration.estimate({ remainingMs: 10000 })?.remainingMs).toBe(12000);
});

it('learns raw prediction error once, without feeding its reserve back into history', () => {
  let clock = 0;
  const calibration = createExportTimeCalibration(() => clock);
  calibration.estimate({ remainingMs: 10000 });
  clock = 5000;
  calibration.estimate({ remainingMs: 5000 });
  clock = 10000;
  expect(calibration.finish()).toEqual([1]);
  expect(calibration.finish()).toEqual([]);
  expect(calibration.estimate({ remainingMs: 10000 })).toBeNull();
});

it('bounds checkpoints while retaining recent evidence during a long export', () => {
  let clock = 0;
  const calibration = createExportTimeCalibration(() => clock);
  // Early pessimism must not crowd out all later accurate observations.
  for (let i = 0; i < 100; i++) {
    clock = i * 5000;
    calibration.estimate({ remainingMs: (500000 - clock) * (i < 10 ? 4 : 1) });
  }
  clock = 500000;
  expect(calibration.finish()).toEqual([1]);
});

it('does not overweight rapid snapshots between spaced checkpoints', () => {
  let clock = 0;
  const calibration = createExportTimeCalibration(() => clock);
  calibration.estimate({ remainingMs: 10000 });
  for (let i = 1; i < 5000; i++) {
    clock = i;
    calibration.estimate({ remainingMs: 1000000 });
  }
  clock = 10000;
  expect(calibration.finish()).toEqual([1]);
});

it('rejects invalid estimates and clocks without contaminating later measurements', () => {
  let clock = 0;
  const calibration = createExportTimeCalibration(() => clock);
  for (const remainingMs of [NaN, Infinity, -1, 0]) {
    expect(calibration.estimate({ remainingMs })).toBeNull();
  }
  expect(calibration.estimate(null)).toBeNull();
  calibration.setHistory([NaN, Infinity, -1, 0, 100]);
  expect(calibration.estimate({ remainingMs: 10000 })?.remainingMs).toBe(12000);
  clock = NaN;
  expect(calibration.estimate({ remainingMs: 10000 })).toBeNull();
  clock = -1;
  expect(calibration.estimate({ remainingMs: 10000 })).toBeNull();
  clock = 10000;
  expect(calibration.finish()).toEqual([1]);
});

it('handles unavailable initial clocks, invalid completion and absent checkpoints', () => {
  let clock = NaN;
  const calibration = createExportTimeCalibration(() => clock);
  expect(calibration.estimate({ remainingMs: 10000 })).toBeNull();
  clock = 100;
  expect(calibration.estimate({ remainingMs: 10000 })?.remainingMs).toBe(12000);
  clock = NaN;
  expect(calibration.finish()).toEqual([]);
  expect(createExportTimeCalibration(() => 0).finish()).toEqual([]);
});

it('caps learned ratios and ignores subsecond checkpoints', () => {
  let clock = 0;
  const high = createExportTimeCalibration(() => clock);
  const low = createExportTimeCalibration(() => clock);
  const short = createExportTimeCalibration(() => clock);
  high.estimate({ remainingMs: 1000 });
  low.estimate({ remainingMs: 1000000 });
  short.estimate({ remainingMs: 900 });
  clock = 10000;
  expect(high.finish()).toEqual([4]);
  expect(low.finish()).toEqual([0.25]);
  expect(short.finish()).toEqual([]);
});

it('separates codec, quality, route and complexity profiles within bounded numeric groups', () => {
  const settings = {
    editor: 'project',
    route: 'render',
    container: 'mp4',
    codec: 'avc',
    width: 1904,
    height: 1064,
    fps: 30,
    quality: 'HIGH',
    complexity: 1,
  } as const;
  const profile = createExportTimeProfile(settings);
  expect(profile).toBe('project-render-mp4-avc-p8-f30-qHIGH-c1');
  expect(createExportTimeProfile({ ...settings, width: 1920, height: 1080 })).toBe(profile);
  expect(createExportTimeProfile({ ...settings, codec: 'hevc' })).not.toBe(profile);
  expect(createExportTimeProfile({ ...settings, route: 'copy' })).not.toBe(profile);
  expect(createExportTimeProfile({ ...settings, quality: 'LOW' })).not.toBe(profile);
  expect(createExportTimeProfile({ ...settings, complexity: 2 })).not.toBe(profile);
  expect(createExportTimeProfile({ ...settings, width: Infinity, fps: NaN, complexity: -1 })).toBe(
    'project-render-mp4-avc-p1-f1-qHIGH-c1'
  );
  expect(createExportTimeProfile({ ...settings, width: 1e8, fps: 999, complexity: 99 })).toBe(
    'project-render-mp4-avc-p256-f240-qHIGH-c16'
  );
});
