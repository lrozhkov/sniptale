import { describe, expect, it } from 'vitest';
import {
  buildDeviceMetricsOverrideParams,
  buildViewportCompositorScale,
  buildViewportEmulationResult,
  viewportCompositorScalesMatch,
} from './helpers';

function compositorMetrics(compositorScale: number, zoom = 1, css = { width: 400, height: 300 }) {
  return {
    layoutViewport: {
      clientWidth: Math.round(css.width * compositorScale * zoom),
      clientHeight: Math.round(css.height * compositorScale * zoom),
    },
    cssLayoutViewport: { clientWidth: css.width, clientHeight: css.height },
    cssVisualViewport: { zoom },
  };
}

describe('exact debugger workspace helpers', () => {
  it('parses evaluated window viewport dimensions', () => {
    expect(
      buildViewportEmulationResult({
        width: 1280,
        height: 720,
      })
    ).toEqual({ cssWidth: 1280, cssHeight: 720 });
  });

  it('rejects missing, non-integer, and non-positive dimensions', () => {
    expect(() => buildViewportEmulationResult({})).toThrow('window.innerWidth');
    expect(() => buildViewportEmulationResult({ width: 1280.5, height: 720 })).toThrow(
      'window.innerWidth'
    );
    expect(() => buildViewportEmulationResult({ width: 1280, height: 0 })).toThrow(
      'window.innerWidth'
    );
  });

  it.each([1, 1.25, 1.5, 2])('derives a %sx display compositor scale', (scale) => {
    expect(buildViewportCompositorScale(compositorMetrics(scale))).toBeCloseTo(scale, 5);
  });

  it('normalizes browser zoom out of the physical-to-CSS ratio', () => {
    expect(buildViewportCompositorScale(compositorMetrics(2, 1.25))).toBeCloseTo(2, 5);
  });

  it('accepts fractional display rounding within one physical pixel', () => {
    expect(
      buildViewportCompositorScale({
        layoutViewport: { clientWidth: 488, clientHeight: 1055 },
        cssLayoutViewport: { clientWidth: 390, clientHeight: 844 },
        cssVisualViewport: { zoom: 1 },
      })
    ).toBeCloseTo(1.25, 3);
  });

  it('rejects malformed, zoomless, and non-uniform compositor metrics', () => {
    expect(() => buildViewportCompositorScale({})).toThrow('compositor metrics');
    expect(() =>
      buildViewportCompositorScale({
        ...compositorMetrics(2),
        cssVisualViewport: {},
      })
    ).toThrow('compositor metrics');
    expect(() =>
      buildViewportCompositorScale({
        ...compositorMetrics(2),
        layoutViewport: { clientWidth: 800, clientHeight: 300 },
      })
    ).toThrow('compositor metrics');
  });

  it('builds a DPR-one override with an explicit compositor scale', () => {
    expect(buildDeviceMetricsOverrideParams(1280, 720, 2)).toEqual({
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: 1280,
      screenHeight: 720,
      positionX: 0,
      positionY: 0,
      scrollbarType: 'overlay',
      viewport: { x: 0, y: 0, width: 1280, height: 720, scale: 2 },
    });
  });

  it('compares post-paint scale drift with a bounded relative tolerance', () => {
    expect(viewportCompositorScalesMatch(1.25, 1.2505)).toBe(true);
    expect(viewportCompositorScalesMatch(1.25, 1.5)).toBe(false);
  });
});
