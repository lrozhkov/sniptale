// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

import {
  drawDistortedBackdrop,
  drawGaussianBackdrop,
  drawPixelatedBackdrop,
  drawSolidBlur,
} from './effects';

beforeEach(() => {
  vi.restoreAllMocks();
});

it('renders solid blur opacity through a local fill branch', () => {
  const ctx = {
    fillRect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
  } as unknown as CanvasRenderingContext2D;

  drawSolidBlur(ctx, 40, 20, { amount: 10, blurType: 'solid', showBorder: false });

  expect(ctx.fillStyle).toBe('rgb(0 0 0 / 0.417)');
  expect(ctx.fillRect).toHaveBeenCalledWith(-20, -10, 40, 20);
});

it('fully covers marker blur at maximum editor strength', () => {
  const ctx = {
    fillRect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
  } as unknown as CanvasRenderingContext2D;

  drawSolidBlur(ctx, 40, 20, { amount: 24, blurType: 'solid', showBorder: false });

  expect(ctx.fillStyle).toBe('rgb(0 0 0 / 1.000)');
});

it('renders gaussian blur through a filtered backdrop draw', () => {
  const ctx = {
    drawImage: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
  } as unknown as CanvasRenderingContext2D;

  drawGaussianBackdrop(ctx, { height: 50, width: 80 } as HTMLCanvasElement, 40, 20, 6, 8);

  expect(ctx.drawImage).toHaveBeenCalledOnce();
});

it('renders pixelated and distorted backdrops through deterministic canvas branches', () => {
  const originalCreateElement = document.createElement.bind(document);
  const scaledContext = { drawImage: vi.fn() };
  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName === 'canvas') {
      return {
        getContext: vi.fn(() => scaledContext),
        height: 0,
        width: 0,
      } as unknown as HTMLCanvasElement;
    }

    return originalCreateElement(tagName);
  });
  const ctx = {
    drawImage: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  const backdrop = { height: 30, width: 60 } as HTMLCanvasElement;

  drawPixelatedBackdrop(ctx, backdrop, 24, 18, 0, 6);
  drawDistortedBackdrop(ctx, backdrop, 24, 18, 2, 6);

  expect(scaledContext.drawImage).toHaveBeenCalledOnce();
  expect(ctx.drawImage).toHaveBeenCalled();
});

it('skips pixelate rendering when the scratch canvas has no 2d context', () => {
  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName === 'canvas') {
      return {
        getContext: vi.fn(() => null),
        height: 0,
        width: 0,
      } as unknown as HTMLCanvasElement;
    }

    return originalCreateElement(tagName);
  });
  const ctx = {
    drawImage: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
  } as unknown as CanvasRenderingContext2D;

  drawPixelatedBackdrop(ctx, { height: 30, width: 60 } as HTMLCanvasElement, 24, 18, 0, 6);

  expect(ctx.drawImage).not.toHaveBeenCalled();
});
