import { describe, expect, it } from 'vitest';

import {
  isViewportCalibrationPattern,
  isViewportFrameVerification,
  type ViewportCalibrationPattern,
} from './viewport-calibration';

const pattern: ViewportCalibrationPattern = {
  edgeThicknessCss: 8,
  colors: {
    bottom: { blue: 214, green: 76, red: 41 },
    left: { blue: 210, green: 40, red: 210 },
    right: { blue: 58, green: 214, red: 42 },
    top: { blue: 64, green: 48, red: 230 },
  },
};

describe('viewport calibration contract', () => {
  it('accepts a bounded distinct four-edge pattern and both verification phases', () => {
    expect(isViewportCalibrationPattern(pattern)).toBe(true);
    expect(isViewportFrameVerification({ pattern, phase: 'marked' })).toBe(true);
    expect(isViewportFrameVerification({ pattern, phase: 'clean' })).toBe(true);
  });

  it('rejects malformed, unsafe, and ambiguous patterns', () => {
    expect(isViewportCalibrationPattern({ ...pattern, edgeThicknessCss: 0 })).toBe(false);
    expect(
      isViewportCalibrationPattern({
        ...pattern,
        colors: { ...pattern.colors, top: { blue: 999, green: 48, red: 230 } },
      })
    ).toBe(false);
    expect(
      isViewportCalibrationPattern({
        ...pattern,
        colors: { ...pattern.colors, right: pattern.colors.top },
      })
    ).toBe(false);
    expect(isViewportFrameVerification({ pattern, phase: 'legacy' })).toBe(false);
  });
});
