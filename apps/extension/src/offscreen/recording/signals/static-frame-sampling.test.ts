// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import {
  captureFrameSignature,
  createFrameSignatureCanvas,
  measureFrameDiff,
} from './static-frame-sampling';

function createContext(data: Uint8ClampedArray): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Expected test canvas context.');
  }
  const imageData = context.createImageData(1, 1);
  Object.defineProperty(imageData, 'data', { configurable: true, value: data });
  vi.spyOn(context, 'clearRect').mockImplementation(() => undefined);
  vi.spyOn(context, 'drawImage').mockImplementation(() => undefined);
  vi.spyOn(context, 'getImageData').mockReturnValue(imageData);
  return context;
}

describe('static-frame sampling', () => {
  it('creates the canonical frame signature canvas', () => {
    const canvas = createFrameSignatureCanvas();

    expect(canvas.width).toBe(32);
    expect(canvas.height).toBe(18);
  });

  it('converts sampled RGB pixels to rounded luma values', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = createContext(new Uint8ClampedArray([100, 50, 0, 255]));
    const video = document.createElement('video');

    expect(captureFrameSignature(ctx, canvas, video)).toEqual(new Uint8ClampedArray([59]));
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 1, 1);
    expect(ctx.drawImage).toHaveBeenCalledWith(video, 0, 0, 1, 1);
  });

  it('treats unavailable pixel channels as black', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;

    expect(
      captureFrameSignature(ctxWithNoPixelData(), canvas, document.createElement('video'))
    ).toEqual(new Uint8ClampedArray([0]));
  });

  it('measures missing comparison samples and empty signatures safely', () => {
    expect(measureFrameDiff(new Uint8ClampedArray([10, 20]), new Uint8ClampedArray([4]))).toBe(13);
    expect(measureFrameDiff(new Uint8ClampedArray(), new Uint8ClampedArray())).toBe(0);
  });
});

function ctxWithNoPixelData(): CanvasRenderingContext2D {
  return createContext(new Uint8ClampedArray());
}
