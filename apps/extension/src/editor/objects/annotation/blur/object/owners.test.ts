// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';

import { createBlurObject } from './factory';
import { getBlurSettings } from './settings';
import { normalizeScaledBlurTarget } from './scale';
import { refreshBlurObjectsForSource } from './source-refresh';
import { updateBlurObject } from './update';

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

function createGaussianBlur() {
  return createBlurObject({
    height: 20,
    id: 'blur-owner',
    labelIndex: 1,
    left: 10,
    settings: { amount: 8, blurType: 'gaussian', showBorder: false },
    source: createBlurSource(),
    top: 12,
    width: 40,
  });
}

it('creates blur objects and keeps settings metadata in the object owner', () => {
  const blur = createGaussianBlur();

  expect(blur.sniptaleId).toBe('blur-owner');
  expect(blur.sniptaleType).toBe('blur');
  expect(getBlurSettings(blur)).toEqual(expect.objectContaining({ amount: 8 }));
});

it('derives blur border visibility from stroke width when showBorder is omitted', () => {
  const blur = createBlurObject({
    height: 20,
    id: 'blur-border-derived',
    labelIndex: 2,
    left: 10,
    settings: { amount: 8, blurType: 'gaussian', strokeWidth: 3 },
    source: createBlurSource(),
    top: 12,
    width: 40,
  });

  expect(blur.sniptaleBlurShowBorder).toBe(true);
});

it('updates blur source metadata while refreshing existing blur objects only', () => {
  const blur = createGaussianBlur();
  const source = createBlurSource({ dataUrl: 'data:image/png;base64,next', left: 4 });
  const canvas = { getObjects: () => [blur, { sniptaleType: 'rectangle' }] };

  refreshBlurObjectsForSource(canvas as never, source as never);

  expect(blur.sniptaleBlurSourceData).toBe('data:image/png;base64,next');
  expect(blur.sniptaleBlurSourceLeft).toBe(4);
});

it('normalizes scaled blur geometry back into dimensions', () => {
  const blur = createGaussianBlur();
  blur.scaleX = 2;
  blur.scaleY = 3;
  const setCoordsSpy = vi.spyOn(blur, 'setCoords');

  expect(normalizeScaledBlurTarget(blur)).toBe(true);
  expect(blur.width).toBe(80);
  expect(blur.height).toBe(60);
  expect(setCoordsSpy).toHaveBeenCalledOnce();
});

it('ignores non-blur objects for update and scale paths', () => {
  const object = { sniptaleType: 'rectangle' };

  expect(updateBlurObject(object as never)).toBeUndefined();
  expect(normalizeScaledBlurTarget(object as never)).toBe(false);
});
