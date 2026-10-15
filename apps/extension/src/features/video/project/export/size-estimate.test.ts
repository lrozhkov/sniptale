import { expect, it } from 'vitest';
import {
  normalizeVideoExportSample,
  projectVideoExportSize,
  videoExportSampleWindows,
} from './size-estimate';

it('bounds sample work to forty-five frames without changing frame rate', () => {
  for (const fps of [24, 30, 60, 120]) {
    const windows = videoExportSampleWindows(600, fps);
    expect(windows).toHaveLength(3);
    expect(
      windows.reduce((sum, window) => sum + (window.end - window.start) * fps, 0)
    ).toBeLessThanOrEqual(45.000001);
    expect(windows[0]!.start).toBe(0);
    expect(windows[2]!.end).toBe(600);
  }
  expect(videoExportSampleWindows(0.25)).toEqual([{ start: 0, end: 0.25 }]);
  for (const duration of [0, -1, NaN, Infinity])
    expect(() => videoExportSampleWindows(duration)).toThrow();
});
it('corrects forced probe keyframes to one every two seconds', () => {
  const result = normalizeVideoExportSample(
    { bytes: 2900, keyBytes: 1000, frames: 20, keyFrames: 1, seconds: 2 / 3 },
    30,
    100
  );
  expect(result.bytes / result.seconds).toBe(1000 / 2 + 100 * 29.5);
});
it('projects sampled bytes with audio allowance and exposes content variation as an approximate range', () => {
  const result = projectVideoExportSize(
    [
      { bytes: 1000, seconds: 2 },
      { bytes: 3000, seconds: 2 },
    ],
    100,
    128000
  );
  expect(result.bytes).toBe(Math.ceil((100000 + 1600000) * 1.02 + 4096));
  expect(result.lowerBytes).toBeLessThan(result.bytes);
  expect(result.upperBytes).toBeGreaterThan(result.bytes);
  expect(result.sampledSeconds).toBe(4);
  expect(() => projectVideoExportSize([], 100, 0)).toThrow();
  expect(() => projectVideoExportSize([{ bytes: 0, seconds: 1 }], 100, 0)).toThrow();
});
