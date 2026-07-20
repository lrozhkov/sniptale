// @vitest-environment jsdom

import { expect, it } from 'vitest';
import {
  createBlurObject,
  getBlurSettings,
  normalizeScaledBlurTarget,
  refreshBlurObjectsForSource,
  updateBlurObject,
} from './blur/object';

function createBlurSource(overrides: Record<string, unknown> = {}) {
  return {
    id: 'source-1',
    dataUrl: 'data:image/png;base64,asset',
    name: null,
    intrinsicWidth: 320,
    intrinsicHeight: 180,
    left: 0,
    top: 0,
    displayWidth: 320,
    displayHeight: 180,
    visible: true,
    locked: true,
    ...overrides,
  };
}

function createGaussianBlurObject() {
  return createBlurObject({
    id: 'blur-2',
    labelIndex: 1,
    left: 10,
    top: 12,
    width: 40,
    height: 20,
    settings: {
      amount: 8,
      blurType: 'gaussian',
      showBorder: false,
    },
    source: createBlurSource(),
  });
}

function refreshBlurFromFinalSource(blur: ReturnType<typeof createBlurObject>) {
  refreshBlurObjectsForSource(
    {
      getObjects: () => [blur],
    } as never,
    createBlurSource({
      id: 'source-3',
      dataUrl: 'data:image/png;base64,final',
      intrinsicHeight: 450,
      intrinsicWidth: 800,
      left: 40,
      top: 50,
      displayHeight: 450,
      displayWidth: 800,
    })
  );
}

it('creates blur objects with persisted settings and source metadata', () => {
  const blur = createBlurObject({
    id: 'blur-1',
    labelIndex: 4,
    left: 16,
    top: 24,
    width: 120,
    height: 80,
    settings: {
      amount: 14,
      blurType: 'solid',
      showBorder: true,
      strokeWidth: 2,
    },
    source: createBlurSource({ name: 'Asset' }),
  });

  expect(blur.sniptaleType).toBe('blur');
  expect(blur.sniptaleRole).toBe('annotation');
  expect(getBlurSettings(blur)).toEqual({
    amount: 14,
    blurType: 'solid',
    borderPresetId: null,
    radius: 0,
    shadow: 0,
    showBorder: true,
    strokeColor: '#475569',
    strokeOpacity: 1,
    strokeStyle: 'solid',
    strokeWidth: 2,
  });
  expect(blur.sniptaleBlurSourceData).toBe('data:image/png;base64,asset');
  expect(blur.stroke).toBeNull();
  expect(blur.strokeWidth).toBe(0);
});

it('normalizes scaled blur geometry', () => {
  const blur = createGaussianBlurObject();
  blur.set({ scaleX: 2, scaleY: 3 });

  expect(normalizeScaledBlurTarget(blur)).toBe(true);
  expect(blur.scaleX).toBe(1);
  expect(blur.scaleY).toBe(1);
  expect(blur.width).toBeGreaterThan(40);
  expect(blur.height).toBeGreaterThan(20);
});

it('refreshes blur source metadata across the canvas owner', () => {
  const blur = createGaussianBlurObject();

  updateBlurObject(blur, {
    source: createBlurSource({
      id: 'source-2',
      dataUrl: 'data:image/png;base64,next',
      intrinsicHeight: 360,
      intrinsicWidth: 640,
      left: 20,
      top: 30,
      displayHeight: 360,
      displayWidth: 640,
    }),
  });

  refreshBlurFromFinalSource(blur);

  expect(blur.sniptaleBlurSourceData).toBe('data:image/png;base64,final');
  expect(blur.sniptaleBlurSourceLeft).toBe(40);
  expect(blur.sniptaleBlurSourceTop).toBe(50);
  expect(blur.sniptaleBlurSourceWidth).toBe(800);
  expect(blur.sniptaleBlurSourceHeight).toBe(450);
});

it('falls back to default settings when blur metadata is invalid', () => {
  const blur = createBlurObject({
    id: 'blur-3',
    labelIndex: 2,
    left: 4,
    top: 6,
    width: 20,
    height: 10,
    settings: {
      amount: 3,
      blurType: 'gaussian',
      showBorder: false,
    },
    source: createBlurSource({
      displayHeight: 50,
      displayWidth: 100,
      intrinsicHeight: 50,
      intrinsicWidth: 100,
    }),
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
});

it('returns early for unchanged blur scaling and null blur refresh inputs', () => {
  const blur = createBlurObject({
    id: 'blur-4',
    labelIndex: 3,
    left: 4,
    top: 6,
    width: 20,
    height: 10,
    settings: {
      amount: 3,
      blurType: 'gaussian',
      showBorder: false,
    },
    source: createBlurSource({
      displayHeight: 50,
      displayWidth: 100,
      intrinsicHeight: 50,
      intrinsicWidth: 100,
    }),
  });

  blur.set({ scaleX: 1, scaleY: 1 });
  expect(normalizeScaledBlurTarget(blur)).toBe(false);
  expect(() => refreshBlurObjectsForSource(null, null)).not.toThrow();
});
