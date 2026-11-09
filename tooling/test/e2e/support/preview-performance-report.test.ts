import { expect, it } from 'vitest';
import {
  aggregatePerformanceSamples,
  validPerformanceDrag,
  performancePercentiles,
  previewPerformanceSummary,
} from './preview-performance-report';

it('reports a slow valid run without a hardware-dependent pass threshold', () => {
  const metrics = {
    measurementIdentity: { valid: true },
    previewStatus: { start: { phase: 'no-status' }, end: { phase: 'no-status' } },
    expired: false,
    overflow: false,
    durationMs: 1000,
    nativePresentedFps: 30,
    rafIntervals: [16, 200, 100],
    composedPublication: { fps: 2, samples: [{ now: 0 }, { now: 500 }, { now: 1000 }] },
  };
  expect(previewPerformanceSummary(metrics)).toMatchObject({
    valid: true,
    sourceFps: 30,
    compositionFps: 3,
    activePublicationFps: 2,
    compositionIntervalMs: { p50: 500, p95: 500 },
  });
  expect(previewPerformanceSummary(metrics, false).compositionFps).toBeNull();
  const idle = { ...metrics, composedPublication: { fps: null, samples: [] } };
  expect(previewPerformanceSummary(idle)).toMatchObject({ valid: true, compositionFps: 0 });
  expect(
    previewPerformanceSummary({
      ...idle,
      previewStatus: { start: { phase: 'failed' }, end: { phase: 'failed' } },
    }).valid
  ).toBe(false);
  expect(previewPerformanceSummary({ ...metrics, overflow: true }).valid).toBe(false);
  expect(
    previewPerformanceSummary({ ...metrics, measurementIdentity: { valid: false } }).valid
  ).toBe(false);
  expect(performancePercentiles([])).toEqual({ count: 0, p50: null, p95: null, p99: null });
});

it('retains zero FPS and excludes invalid samples from aggregate comparisons', () => {
  expect(
    aggregatePerformanceSamples([
      { valid: true, compositionFps: 0 },
      { valid: true, compositionFps: 30 },
      { valid: false, compositionFps: 600 },
      { compositionFps: 120 },
    ])
  ).toMatchObject({
    validSamples: 2,
    invalidSamples: 2,
    compositionFps: { count: 2, p50: 0, p95: 30 },
  });
});

it('excludes refused and incomplete drags while retaining completed measurements', () => {
  const complete = {
    stageValid: true,
    errorFree: true,
    trustedInputsReceived: true,
    geometryMoved: true,
    authoredCommitted: true,
    decodedFixtureVisible: true,
  };
  const samples = Object.keys(complete).map((key) => ({
    valid: validPerformanceDrag({ ...complete, [key]: false }),
    publicationLatencyMs: { p95: 999 },
  }));
  samples.push({ valid: validPerformanceDrag(complete), publicationLatencyMs: { p95: 12 } });
  expect(aggregatePerformanceSamples(samples)).toMatchObject({
    validSamples: 1,
    invalidSamples: 6,
    publicationP95Ms: { count: 1, p50: 12, p95: 12 },
  });
});
