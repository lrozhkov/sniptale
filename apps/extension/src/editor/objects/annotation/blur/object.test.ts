// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';

import {
  createBlurObject,
  getBlurSettings,
  normalizeScaledBlurTarget,
  refreshBlurObjectsForSource,
  updateBlurObject,
} from './object';

function createBlurSource(overrides: Record<string, unknown> = {}) {
  return {
    dataUrl: 'data:image/png;base64,asset',
    displayHeight: 180,
    displayWidth: 320,
    id: 'source-1',
    intrinsicHeight: 180,
    intrinsicWidth: 320,
    left: 0,
    locked: true,
    name: null,
    top: 0,
    visible: true,
    ...overrides,
  };
}

it('accepts pixelate blur settings and keeps source metadata updates inside the blur owner', () => {
  const blur = createBlurObject({
    height: 20,
    id: 'blur-owner-1',
    labelIndex: 1,
    left: 10,
    settings: {
      amount: 12,
      blurType: 'pixelate',
      showBorder: false,
    },
    source: createBlurSource(),
    top: 12,
    width: 40,
  });

  updateBlurObject(blur, {
    bounds: { height: 30, left: 5, top: 6, width: 50 },
    source: createBlurSource({ dataUrl: 'data:image/png;base64,next', left: 4, top: 5 }),
  });

  expect(getBlurSettings(blur)).toEqual({
    amount: 12,
    blurType: 'pixelate',
    borderPresetId: null,
    radius: 0,
    shadow: 0,
    showBorder: false,
    strokeColor: '#475569',
    strokeOpacity: 1,
    strokeStyle: 'solid',
    strokeWidth: 0,
  });
  expect(blur.width).toBe(50);
  expect(blur.height).toBe(30);
  expect(blur.sniptaleBlurSourceData).toBe('data:image/png;base64,next');
});

function createBorderedBlurObject() {
  return createBlurObject({
    height: 20,
    id: 'blur-owner-border',
    labelIndex: 1,
    left: 10,
    settings: {
      amount: 12,
      blurType: 'solid',
      borderPresetId: 'preset-1',
      radius: 14,
      shadow: 30,
      showBorder: true,
      strokeColor: '#112233',
      strokeOpacity: 0.55,
      strokeStyle: 'dash-dot',
      strokeWidth: 6,
    },
    source: createBlurSource(),
    top: 12,
    width: 40,
  });
}

it('applies rectangle-like border settings while preserving hidden border metadata', () => {
  const blur = createBorderedBlurObject();

  expect(getBlurSettings(blur)).toEqual(
    expect.objectContaining({
      borderPresetId: 'preset-1',
      radius: 14,
      shadow: 30,
      showBorder: true,
      strokeColor: '#112233',
      strokeOpacity: 0.55,
      strokeStyle: 'dash-dot',
      strokeWidth: 6,
    })
  );
  expect(blur.stroke).toBeNull();
  expect(blur.strokeWidth).toBe(0);
  expect(blur.left).toBe(10);
  expect(blur.top).toBe(12);
  expect(blur.width).toBe(40);
  expect(blur.height).toBe(20);
  expect(blur.strokeDashArray).toBeUndefined();
  expect(blur.sniptaleBlurStrokeStyle).toBe('dash-dot');
  expect(blur.rx).toBe(14);
  expect(blur.shadow).toBeNull();

  updateBlurObject(blur, { settings: { ...getBlurSettings(blur), showBorder: false } });

  expect(blur.stroke).toBeNull();
  expect(blur.strokeWidth).toBe(0);
  expect(blur.left).toBe(10);
  expect(blur.top).toBe(12);
  expect(blur.width).toBe(40);
  expect(blur.height).toBe(20);
  expect(blur.shadow).toBeNull();
  expect(getBlurSettings(blur)).toEqual(
    expect.objectContaining({
      strokeColor: '#112233',
      strokeOpacity: 0.55,
      strokeStyle: 'dash-dot',
      strokeWidth: 6,
    })
  );
});

it('expands blur border symmetrically around the existing blur area', () => {
  const blur = createBlurObject({
    height: 20,
    id: 'blur-owner-centered-border',
    labelIndex: 4,
    left: 10,
    settings: {
      amount: 8,
      blurType: 'solid',
      showBorder: false,
      strokeWidth: 0,
    },
    source: createBlurSource(),
    top: 12,
    width: 40,
  });

  updateBlurObject(blur, {
    settings: {
      ...getBlurSettings(blur),
      showBorder: true,
      strokeWidth: 10,
    },
  });

  expect(blur.left).toBe(10);
  expect(blur.top).toBe(12);
  expect(blur.width).toBe(40);
  expect(blur.height).toBe(20);

  updateBlurObject(blur, {
    settings: {
      ...getBlurSettings(blur),
      strokeWidth: 20,
    },
  });

  expect(blur.left).toBe(10);
  expect(blur.top).toBe(12);
  expect(blur.width).toBe(40);
  expect(blur.height).toBe(20);
});

it('falls back to default blur settings and exits safely for unchanged owner-local blur paths', () => {
  const blur = createBlurObject({
    height: 10,
    id: 'blur-owner-2',
    labelIndex: 2,
    left: 4,
    settings: {
      amount: 3,
      blurType: 'gaussian',
      showBorder: false,
    },
    source: createBlurSource(),
    top: 6,
    width: 20,
  });
  delete blur.sniptaleBlurAmount;
  blur.sniptaleBlurType = 'unknown' as never;
  delete blur.sniptaleBlurShowBorder;

  expect(getBlurSettings(blur)).toEqual({
    amount: 10,
    blurType: 'gaussian',
    borderPresetId: null,
    radius: 0,
    shadow: 0,
    showBorder: false,
    strokeColor: '#475569',
    strokeOpacity: 1,
    strokeStyle: 'solid',
    strokeWidth: 0,
  });
  expect(normalizeScaledBlurTarget(blur)).toBe(false);
  expect(() => refreshBlurObjectsForSource(null, null)).not.toThrow();
});

it('refreshes blur coords when normalization collapses scale-only blur geometry into dimensions', () => {
  const blur = createBlurObject({
    height: 20,
    id: 'blur-owner-3',
    labelIndex: 3,
    left: 10,
    settings: {
      amount: 8,
      blurType: 'gaussian',
      showBorder: false,
    },
    source: createBlurSource(),
    top: 12,
    width: 40,
  });
  blur.scaleX = 2;
  blur.scaleY = 3;
  const setCoordsSpy = vi.spyOn(blur, 'setCoords');

  expect(normalizeScaledBlurTarget(blur)).toBe(true);
  expect(blur.scaleX).toBe(1);
  expect(blur.scaleY).toBe(1);
  expect(blur.width).toBe(80);
  expect(blur.height).toBe(60);
  expect(setCoordsSpy).toHaveBeenCalledOnce();
});
