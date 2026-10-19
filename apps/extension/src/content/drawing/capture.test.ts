// @vitest-environment jsdom
import { Image as CanvasImage } from 'canvas';
import { afterEach, expect, it, vi } from 'vitest';
import { compositeContentDrawingCapture, type ContentDrawingCaptureSnapshot } from './capture';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function source() {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 150;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#2266aa';
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas.toDataURL();
}

function snapshot(): ContentDrawingCaptureSnapshot {
  return {
    objects: [
      {
        id: 'shape',
        kind: 'rectangle',
        bounds: { x: 30, y: 40, width: 20, height: 10 },
        color: '#ff0000',
        fillColor: '#ff0000',
        width: 1,
      },
    ],
    projection: { x: 10, y: 20 },
    viewport: { width: 100, height: 50 },
  };
}

function pixels(dataUrl: string) {
  const image = new Image();
  image.src = dataUrl;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function pixel(dataUrl: string, left: number, top: number) {
  const image = pixels(dataUrl);
  const offset = (top * image.width + left) * 4;
  return Array.from(image.data.slice(offset, offset + 4));
}

it('returns an unchanged source without decoding when no crop drawing exists', async () => {
  const empty = { ...snapshot(), objects: [] };
  await expect(compositeContentDrawingCapture('original', empty)).resolves.toBe('original');
});

it('projects document ink and independently scales both raster axes without changing source', async () => {
  vi.stubGlobal('Image', CanvasImage);
  const original = source();
  const result = await compositeContentDrawingCapture(original, snapshot());
  expect(pixel(result, 60, 75)).toEqual([255, 0, 0, 255]);
  expect(pixel(result, 60, 110)).toEqual([34, 102, 170, 255]);
  expect(pixel(result, 10, 10)).toEqual([34, 102, 170, 255]);
  expect(pixel(original, 60, 75)).toEqual([34, 102, 170, 255]);
});

it('rejects invalid viewport dimensions before decoding', async () => {
  await expect(
    compositeContentDrawingCapture(source(), {
      ...snapshot(),
      viewport: { width: 0, height: 50 },
    })
  ).rejects.toThrow('viewport is invalid');
});

it.each(['shape-first', 'text-first'])(
  'matches live ink-over-text layers for overlapping objects created %s',
  async (order) => {
    vi.stubGlobal('Image', CanvasImage);
    const shape = snapshot().objects[0]!;
    const text: ContentDrawingCaptureSnapshot['objects'][number] = {
      id: 'text',
      kind: 'text',
      bounds: { x: 20, y: 30, width: 70, height: 25 },
      text: 'MMMM',
      color: '#000000',
      backgroundColor: '#ff8800',
      fontFamily: 'serif',
      fontSize: 20,
    };
    const textOnly = await compositeContentDrawingCapture(source(), {
      ...snapshot(),
      objects: [text],
    });
    const combined = await compositeContentDrawingCapture(source(), {
      ...snapshot(),
      objects: order === 'shape-first' ? [shape, text] : [text, shape],
    });
    const textPixels = pixels(textOnly);
    const combinedPixels = pixels(combined);
    let textPixelsCoveredByInk = 0;
    for (let top = 65; top < 85; top += 1) {
      for (let left = 45; left < 75; left += 1) {
        const offset = (top * textPixels.width + left) * 4;
        const below = textPixels.data.slice(offset, offset + 4);
        if (below[0] === 34 && below[1] === 102 && below[2] === 170) continue;
        textPixelsCoveredByInk += 1;
        expect(Array.from(combinedPixels.data.slice(offset, offset + 4))).toEqual([255, 0, 0, 255]);
      }
    }
    expect(textPixelsCoveredByInk).toBeGreaterThan(100);
  }
);

it('rejects undecodable capture input instead of exporting without drawings', async () => {
  vi.stubGlobal('Image', CanvasImage);
  await expect(compositeContentDrawingCapture('invalid', snapshot())).rejects.toThrow(
    'could not be decoded'
  );
});

it('fails closed when the canvas runtime cannot render requested blur', async () => {
  vi.stubGlobal('Image', CanvasImage);
  await expect(
    compositeContentDrawingCapture(source(), {
      ...snapshot(),
      objects: [
        {
          id: 'blur',
          kind: 'blur',
          bounds: { x: 30, y: 40, width: 20, height: 10 },
          amount: 8,
        },
      ],
    })
  ).rejects.toThrow('blur is unavailable');
});

it('clips rotated blur over the retained backdrop before drawing ordinary ink', async () => {
  vi.stubGlobal('Image', CanvasImage);
  const original = source();
  const context = document.createElement('canvas').getContext('2d')!;
  let filter = 'none';
  const filterWrites = vi.fn((value: string) => {
    filter = value;
  });
  Object.defineProperty(context, 'filter', {
    configurable: true,
    get: () => filter,
    set: filterWrites,
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
  const clip = vi.spyOn(context, 'clip');
  const rotate = vi.spyOn(context, 'rotate');
  const fill = vi.spyOn(context, 'fill');
  await compositeContentDrawingCapture(original, {
    ...snapshot(),
    objects: [
      ...snapshot().objects,
      {
        id: 'blur',
        kind: 'blur',
        bounds: { x: 30, y: 40, width: 20, height: 10 },
        rotation: 45,
        amount: 8,
      },
    ],
  });
  expect(filterWrites).toHaveBeenCalledWith('blur(16px)');
  expect(rotate).toHaveBeenCalledWith(Math.PI / 4);
  expect(rotate).toHaveBeenCalledWith(-Math.PI / 4);
  expect(clip.mock.invocationCallOrder[0]).toBeLessThan(fill.mock.invocationCallOrder[0]!);
});

it('waits for requested text fonts and keeps stencil glyphs transparent over source', async () => {
  vi.stubGlobal('Image', CanvasImage);
  const load = vi.fn(async () => []);
  Object.defineProperty(document, 'fonts', { configurable: true, value: { load } });
  try {
    const result = await compositeContentDrawingCapture(source(), {
      objects: [
        {
          id: 'text',
          kind: 'text',
          bounds: { x: 10, y: 5, width: 80, height: 30 },
          text: 'TEST',
          color: 'transparent',
          backgroundColor: '#ff8800',
          fontFamily: 'serif',
          fontSize: 20,
        },
      ],
      projection: { x: 0, y: 0 },
      viewport: { width: 100, height: 50 },
    });
    expect(load).toHaveBeenCalledWith(expect.stringContaining('20px'), 'TEST');
    expect(pixel(result, 10, 10)).toEqual([34, 102, 170, 255]);
    expect(result).not.toBe(source());
  } finally {
    Reflect.deleteProperty(document, 'fonts');
  }
});
