// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

import { renderSvgBlob } from './image';

function stubImageLoad(mode: 'load' | 'error') {
  vi.stubGlobal(
    'Image',
    class {
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      decoding = 'async';

      set src(_value: string) {
        queueMicrotask(() => {
          if (mode === 'load') {
            this.onload?.();
            return;
          }

          this.onerror?.();
        });
      }
    }
  );
}

beforeEach(() => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});

it('renders an svg blob to the requested output blob', async () => {
  stubImageLoad('load');

  const clearRect = vi.fn();
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect,
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  const toBlob = vi
    .spyOn(HTMLCanvasElement.prototype, 'toBlob')
    .mockImplementation((callback, type) => {
      callback?.(new Blob(['png'], { type: type ?? 'image/png' }));
    });

  const blob = await renderSvgBlob({
    blobType: 'image/png',
    quality: 0.8,
    size: { width: 320, height: 180 },
    svgMarkup: '<svg />',
  });

  expect(blob.type).toBe('image/png');
  expect(clearRect).toHaveBeenCalledWith(0, 0, 320, 180);
  expect(drawImage).toHaveBeenCalledTimes(1);
  expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png', 0.8);
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
});

it('fails when the canvas context cannot be created', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

  await expect(
    renderSvgBlob({
      blobType: 'image/png',
      size: { width: 320, height: 180 },
      svgMarkup: '<svg />',
    })
  ).rejects.toThrow('Failed to create scenario AI attachment canvas');
});

it('fails when the image blob cannot be loaded', async () => {
  stubImageLoad('error');

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);

  await expect(
    renderSvgBlob({
      blobType: 'image/png',
      size: { width: 320, height: 180 },
      svgMarkup: '<svg />',
    })
  ).rejects.toThrow('Failed to load image blob');

  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
});

it('fails when canvas rendering returns no blob', async () => {
  stubImageLoad('load');

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
    callback?.(null);
  });

  await expect(
    renderSvgBlob({
      blobType: 'image/png',
      size: { width: 320, height: 180 },
      svgMarkup: '<svg />',
    })
  ).rejects.toThrow('Failed to render scenario AI attachment blob');
});
