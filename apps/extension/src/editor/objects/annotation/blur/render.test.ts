// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  captureBlurBackdropMock: vi.fn(),
  drawDistortedBackdropMock: vi.fn(),
  drawGaussianBackdropMock: vi.fn(),
  drawPixelatedBackdropMock: vi.fn(),
  drawSolidBlurMock: vi.fn(),
}));

vi.mock('./backdrop/capture', () => ({
  captureBlurBackdrop: mocks.captureBlurBackdropMock,
}));

vi.mock('./effects', () => ({
  drawDistortedBackdrop: mocks.drawDistortedBackdropMock,
  drawGaussianBackdrop: mocks.drawGaussianBackdropMock,
  drawPixelatedBackdrop: mocks.drawPixelatedBackdropMock,
  drawSolidBlur: mocks.drawSolidBlurMock,
}));

import { attachBlurRenderer } from './render/attach';
import { refreshBlurRendering } from './render/refresh';
import type { BlurRuntimeObject } from './types';

function createObject(): BlurRuntimeObject {
  return {
    _render: vi.fn(),
    canvas: { requestRenderAll: vi.fn() } as never,
    dirty: false,
    height: 20,
    width: 40,
  } as never;
}

function createClipContext(): CanvasRenderingContext2D {
  return {
    beginPath: vi.fn(),
    clip: vi.fn(),
    closePath: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    stroke: vi.fn(),
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.captureBlurBackdropMock.mockReturnValue({
    canvas: { height: 30, width: 60 },
    height: 20,
    padding: 4,
    width: 40,
  });
});

it('attaches once and routes solid blur through the solid fill helper', () => {
  const object = createObject();
  const ctx = createClipContext();

  attachBlurRenderer(object, () => ({ amount: 8, blurType: 'solid', showBorder: false }));
  const firstRender = object._render;
  attachBlurRenderer(object, () => ({ amount: 8, blurType: 'solid', showBorder: false }));
  object._render(ctx);

  expect(object._render).toBe(firstRender);
  expect(mocks.drawSolidBlurMock).toHaveBeenCalledWith(
    ctx,
    40,
    20,
    expect.objectContaining({ blurType: 'solid' })
  );
});

it('clips blur effects to the blur area and draws the frame outside it', () => {
  const object = createObject();
  const ctx = createClipContext();
  const baseRender = object._render as ReturnType<typeof vi.fn>;

  attachBlurRenderer(object, () => ({
    amount: 8,
    blurType: 'solid',
    radius: 10,
    showBorder: true,
    strokeWidth: 6,
  }));
  object._render(ctx);

  expect(ctx.save).toHaveBeenCalledBefore(mocks.drawSolidBlurMock);
  expect(ctx.clip).toHaveBeenCalledBefore(mocks.drawSolidBlurMock);
  expect(mocks.drawSolidBlurMock).toHaveBeenCalledWith(
    ctx,
    40,
    20,
    expect.objectContaining({ showBorder: true })
  );
  expect(ctx.restore).toHaveBeenCalledBefore(baseRender);
  expect(ctx.stroke).toHaveBeenCalledOnce();
  expect(baseRender).toHaveBeenCalledAfter(mocks.drawSolidBlurMock);
});

it('treats zero-width and legacy hidden borders as no inset', () => {
  const object = createObject();
  const ctx = createClipContext();

  attachBlurRenderer(object, () => ({
    amount: 8,
    blurType: 'solid',
    showBorder: false,
    strokeWidth: 6,
  }));
  object._render(ctx);

  expect(mocks.drawSolidBlurMock).toHaveBeenCalledWith(
    ctx,
    40,
    20,
    expect.objectContaining({ showBorder: false })
  );
});

it('routes gaussian, distortion, and pixelate blur types through their effect helpers', () => {
  const ctx = createClipContext();
  const settings = [
    { blurType: 'gaussian', helper: mocks.drawGaussianBackdropMock },
    { blurType: 'distortion', helper: mocks.drawDistortedBackdropMock },
    { blurType: 'pixelate', helper: mocks.drawPixelatedBackdropMock },
  ] as const;

  for (const entry of settings) {
    const object = createObject();
    attachBlurRenderer(object, () => ({
      amount: 8,
      blurType: entry.blurType,
      showBorder: false,
    }));
    object._render(ctx);
    expect(entry.helper).toHaveBeenCalled();
  }
});

it('skips backdrop rendering when capture fails and supports contexts without line dash', () => {
  const object = createObject();
  const ctx = createClipContext();
  delete (ctx as { setLineDash?: unknown }).setLineDash;
  mocks.captureBlurBackdropMock.mockReturnValueOnce(null);

  attachBlurRenderer(object, () => ({
    amount: 8,
    blurType: 'gaussian',
    radius: 0,
    showBorder: true,
    strokeWidth: 2,
  }));
  object._render(ctx);

  expect(mocks.drawGaussianBackdropMock).not.toHaveBeenCalled();
  expect(ctx.rect).toHaveBeenCalled();
  expect(ctx.stroke).toHaveBeenCalledOnce();
});

it('keeps refresh local when no canvas is attached', () => {
  const object = createObject();
  delete (object as { canvas?: unknown }).canvas;

  refreshBlurRendering(object);

  expect(object.dirty).toBe(true);
});

it('marks blur objects dirty and requests a rerender on refresh', () => {
  const object = createObject();

  refreshBlurRendering(object);

  expect(object.dirty).toBe(true);
  expect(object.canvas?.requestRenderAll).toHaveBeenCalledOnce();
});
