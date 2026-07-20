// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';

import {
  createBackgroundGradient,
  getBackgroundImageLayout,
  loadBackgroundImageElement,
  type BackgroundCanvasSize,
} from './geometry';

const SIZE: BackgroundCanvasSize = { width: 320, height: 180 };
const IMAGE = { height: 90, width: 100 };

it('keeps fabric gradient vectors aligned with css linear-gradient semantics', () => {
  const horizontal = createBackgroundGradient(SIZE, {
    backgroundGradientAngle: 90,
    backgroundGradientFrom: '#111111',
    backgroundGradientTo: '#222222',
  } as never);
  const vertical = createBackgroundGradient(SIZE, {
    backgroundGradientAngle: 0,
    backgroundGradientFrom: '#111111',
    backgroundGradientTo: '#222222',
  } as never);
  const threeStop = createBackgroundGradient(SIZE, {
    backgroundGradientAngle: 45,
    backgroundGradientColorStops: [
      { color: '#111111', offset: 0 },
      { color: '#555555', offset: 0.25, opacity: 0.5 },
      { color: '#222222', offset: 1 },
    ],
    backgroundGradientFrom: '#111111',
    backgroundGradientStops: ['#111111', '#555555', '#222222'],
    backgroundGradientTo: '#222222',
  } as never);

  expect(horizontal.coords.y1).toBe(horizontal.coords.y2);
  expect(horizontal.coords.x1).toBeLessThan(horizontal.coords.x2);
  expect(vertical.coords.x1).toBe(vertical.coords.x2);
  expect(vertical.coords.y1).toBeGreaterThan(vertical.coords.y2);
  expect(threeStop).toMatchObject({
    colorStops: [
      { color: '#111111', offset: 0 },
      { color: 'rgba(85, 85, 85, 0.5)', offset: 0.25 },
      { color: '#222222', offset: 1 },
    ],
  });
});

it('resolves image layouts for constrained background fits', () => {
  expect(getBackgroundImageLayout('contain', SIZE, IMAGE as never)).toMatchObject({
    left: 60,
    scaleX: 2,
    scaleY: 2,
    top: 0,
  });
  expect(getBackgroundImageLayout('fit-width', SIZE, IMAGE as never)).toMatchObject({
    scaleX: 3.2,
    scaleY: 3.2,
    top: -54,
  });
  expect(getBackgroundImageLayout('fit-height', SIZE, IMAGE as never)).toMatchObject({
    left: 60,
    scaleX: 2,
    scaleY: 2,
  });
  expect(getBackgroundImageLayout('cover', SIZE, IMAGE as never)).toMatchObject({
    scaleX: 3.2,
    scaleY: 3.2,
  });
});

it('rounds centered background image offsets to device pixels', () => {
  const layout = getBackgroundImageLayout('contain', { height: 181, width: 321 }, {
    height: 90,
    width: 100,
  } as never);

  expect(layout.left).toBe(60);
  expect(layout.top).toBe(0);
});

it('floors overflowing background image offsets to avoid top-left seams', () => {
  const layout = getBackgroundImageLayout('cover', { height: 181, width: 321 }, {
    height: 360,
    width: 640,
  } as never);

  expect(layout.left).toBe(-1);
  expect(layout.top).toBe(0);
});

it('surfaces image element load failures for tiled backgrounds', async () => {
  class BrokenImage {
    onerror: (() => void) | null = null;
    set src(_source: string) {
      this.onerror?.();
    }
  }
  vi.stubGlobal('Image', BrokenImage);

  await expect(loadBackgroundImageElement('data:image/png;base64,broken')).rejects.toThrow(
    'Failed to load editor background image'
  );
  vi.unstubAllGlobals();
});
