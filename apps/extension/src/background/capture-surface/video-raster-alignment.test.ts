import { describe, expect, it } from 'vitest';
import { resolveVideoRasterWindowSize } from './video-raster-alignment';

describe('video preset raster alignment', () => {
  const window = { width: 2560, height: 1392 };
  const workArea = { width: 3840, height: 2160 };

  it('aligns the tab content rather than the already-even outer window', () => {
    expect(
      resolveVideoRasterWindowSize(window, { width: 2560, height: 1305, scale: 1 }, workArea)
    ).toEqual({ width: 2560, height: 1391 });
  });

  it('keeps odd logical dimensions when the physical raster is already even', () => {
    expect(
      resolveVideoRasterWindowSize(window, { width: 2559, height: 1305, scale: 2 }, workArea)
    ).toEqual(window);
  });

  it('accounts for fractional display scaling on both axes', () => {
    const result = resolveVideoRasterWindowSize(
      window,
      { width: 2558, height: 1305, scale: 1.25 },
      workArea
    );
    expect(Math.round((2558 + result.width - window.width) * 1.25) % 2).toBe(0);
    expect(Math.round((1305 + result.height - window.height) * 1.25) % 2).toBe(0);
    expect(Math.abs(result.width - window.width)).toBeLessThanOrEqual(4);
    expect(Math.abs(result.height - window.height)).toBeLessThanOrEqual(4);
  });

  it('does not expand beyond the available display', () => {
    const result = resolveVideoRasterWindowSize(
      window,
      { width: 2560, height: 1305, scale: 1 },
      window
    );
    expect(result.height).toBe(1391);
  });

  it('rejects invalid measurements instead of resizing from guessed geometry', () => {
    expect(() =>
      resolveVideoRasterWindowSize(window, { width: 0, height: 1305, scale: 1 }, workArea)
    ).toThrow();
    expect(() =>
      resolveVideoRasterWindowSize(window, { width: 2560, height: 1305, scale: NaN }, workArea)
    ).toThrow();
  });
});
