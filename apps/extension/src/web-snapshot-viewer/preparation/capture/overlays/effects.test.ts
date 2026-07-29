// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BlurType, FrameData } from '../../../../features/highlighter/contracts';
import { createCanvasContextStub } from './canvas-context.test.helpers';
import type { ViewerFrameProjection } from './canvas';
import { drawViewerBlurLayers, drawViewerFocusLayer } from './effects';

function createContext() {
  const order: string[] = [];
  const context = createCanvasContextStub({
    beginPath: vi.fn(() => order.push('beginPath')),
    clip: vi.fn(() => order.push('clip')),
    drawImage: vi.fn(() => order.push('drawImage')),
    fill: vi.fn(() => order.push('fill')),
    fillRect: vi.fn(() => order.push('fillRect')),
    imageSmoothingEnabled: true,
    rect: vi.fn(() => order.push('rect')),
    restore: vi.fn(() => order.push('restore')),
    roundRect: vi.fn(() => order.push('roundRect')),
    save: vi.fn(() => order.push('save')),
  });
  return { context, order };
}

function createProjection(effectMode: 'blur' | 'focus', blurType: BlurType = 'gaussian') {
  const frame: FrameData = {
    blurSettings: { amount: blurType === 'solid' ? 10 : blurType === 'pixelate' ? 4 : 6, blurType },
    effectMode,
    focusSettings: { opacity: 0.65 },
    height: 24,
    id: `${effectMode}-${blurType}`,
    width: 40,
    x: 10,
    y: 12,
  };
  return {
    frame,
    surface: {
      decorationVisible: false,
      fillVisible: false,
      geometry: { height: 24, radius: 6, strokeWidth: 4, width: 40, x: 10, y: 12 },
      strokeVisible: false,
    },
  } satisfies ViewerFrameProjection;
}

afterEach(() => {
  vi.restoreAllMocks();
});

it('draws unit-opacity focus dimming with a union of rounded holes', () => {
  const { context } = createContext();
  const maskOrder: string[] = [];
  const maskContext = createCanvasContextStub({
    beginPath: vi.fn(() => maskOrder.push('beginPath')),
    fill: vi.fn(() => maskOrder.push('fill')),
    fillRect: vi.fn(() => maskOrder.push('fillRect')),
    roundRect: vi.fn(() => maskOrder.push('roundRect')),
    scale: vi.fn(() => maskOrder.push('scale')),
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(maskContext);
  const second = createProjection('focus');
  second.frame = { ...second.frame, focusSettings: { opacity: 0.4 }, id: 'focus-second' };
  second.surface.geometry = { ...second.surface.geometry, x: 30 };

  drawViewerFocusLayer({
    context,
    projections: [createProjection('focus'), second],
    scale: 2,
    width: 100,
    height: 60,
  });

  expect(maskContext.fillStyle).toBe('rgb(0 0 0 / 0.650)');
  expect(maskContext.globalCompositeOperation).toBe('destination-out');
  expect(maskContext.scale).toHaveBeenCalledWith(2, 2);
  expect(maskContext.fillRect).toHaveBeenCalledWith(0, 0, 100, 60);
  expect(maskContext.roundRect).toHaveBeenNthCalledWith(1, 10, 12, 40, 24, 6);
  expect(maskContext.roundRect).toHaveBeenNthCalledWith(2, 30, 12, 40, 24, 6);
  expect(maskOrder).toEqual([
    'scale',
    'fillRect',
    'beginPath',
    'roundRect',
    'fill',
    'beginPath',
    'roundRect',
    'fill',
  ]);
  expect(context.drawImage).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), 0, 0, 100, 60);
});

describe.each([
  { blurType: 'gaussian' as const },
  { blurType: 'pixelate' as const },
  { blurType: 'distortion' as const },
  { blurType: 'solid' as const },
])('$blurType viewer effect', ({ blurType }) => {
  it('clips the selected effect to the same rounded surface', () => {
    const { context, order } = createContext();
    const scratchContext = createCanvasContextStub({ drawImage: vi.fn() });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(scratchContext);
    const backdrop = document.createElement('canvas');
    backdrop.width = 200;
    backdrop.height = 120;

    drawViewerBlurLayers({
      backdrop,
      context,
      height: 60,
      projections: [createProjection('blur', blurType)],
      scale: 2,
      width: 100,
    });

    expect(context.roundRect).toHaveBeenCalledWith(10, 12, 40, 24, 6);
    expect(order.slice(0, 4)).toEqual(['save', 'beginPath', 'roundRect', 'clip']);
    expect(order.at(-1)).toBe('restore');

    switch (blurType) {
      case 'gaussian':
        expect(context.filter).toBe('blur(6px)');
        expect(context.drawImage).toHaveBeenCalledWith(backdrop, 0, 0, 200, 120, 0, 0, 100, 60);
        break;
      case 'pixelate': {
        const scratch = (context.drawImage as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
        expect(scratch).toBeInstanceOf(HTMLCanvasElement);
        expect((scratch as HTMLCanvasElement).width).toBe(10);
        expect((scratch as HTMLCanvasElement).height).toBe(6);
        expect(scratchContext.drawImage).toHaveBeenCalledWith(
          backdrop,
          20,
          24,
          80,
          48,
          0,
          0,
          10,
          6
        );
        expect(context.imageSmoothingEnabled).toBe(false);
        expect(context.drawImage).toHaveBeenCalledWith(scratch, 0, 0, 10, 6, 10, 12, 40, 24);
        break;
      }
      case 'distortion':
        expect(context.drawImage).toHaveBeenCalledTimes(12);
        expect(context.drawImage).toHaveBeenNthCalledWith(
          1,
          backdrop,
          expect.any(Number),
          24,
          80,
          4,
          10,
          12,
          40,
          2
        );
        break;
      case 'solid':
        expect(context.fillStyle).toBe('rgb(0 0 0 / 0.400)');
        expect(context.fillRect).toHaveBeenCalledWith(10, 12, 40, 24);
        break;
    }
  });
});
