// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canvasToRasterDataUrl,
  createRasterCanvas,
  getRasterImageData,
  loadRasterCanvasFromDataUrl,
  putRasterImageData,
} from './canvas';
import { parseRasterColor } from './color';
import { clampBitmapCoordinate } from './coordinates';

beforeEach(() => {
  vi.restoreAllMocks();
});

function registerCanvasIoTest() {
  it('keeps canvas IO in the canvas owner', async () => {
    class MockImage {
      naturalHeight = 2;
      naturalWidth = 3;
      width = 3;
      height = 2;
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      set src(_value: string) {
        this.onload?.();
      }
    }
    vi.stubGlobal('Image', MockImage as unknown as typeof Image);
    const imageData = { data: new Uint8ClampedArray(4), height: 1, width: 1 } as ImageData;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => imageData),
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D);

    const canvas = createRasterCanvas(3.4, 4.6);
    const loaded = await loadRasterCanvasFromDataUrl('data:image/png;base64,abc');
    putRasterImageData(canvas, getRasterImageData(canvas));

    expect(canvasToRasterDataUrl(canvas)).toContain('data:image/png');
    expect(loaded.width).toBe(3);
    expect(loaded.height).toBe(2);
  });
}

function registerCanvasFailureTest() {
  it('fails canvas IO explicitly when context or image loading is unavailable', async () => {
    class ErrorImage {
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      set src(_value: string) {
        this.onerror?.();
      }
    }
    vi.stubGlobal('Image', ErrorImage as unknown as typeof Image);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    expect(() => getRasterImageData(createRasterCanvas(1, 1))).toThrow(
      'Canvas 2D context is unavailable.'
    );
    await expect(loadRasterCanvasFromDataUrl('data:image/png;base64,bad')).rejects.toThrow(
      'Failed to load raster bitmap.'
    );
  });
}

function registerImageDimensionFallbackTest() {
  it('falls back to element dimensions when natural image dimensions are unavailable', async () => {
    class FallbackImage {
      naturalHeight = 0;
      naturalWidth = 0;
      width = 7;
      height = 5;
      onload: null | (() => void) = null;
      set src(_value: string) {
        this.onload?.();
      }
    }
    vi.stubGlobal('Image', FallbackImage as unknown as typeof Image);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);

    const loaded = await loadRasterCanvasFromDataUrl('data:image/png;base64,abc');
    expect(loaded.width).toBe(7);
    expect(loaded.height).toBe(5);
  });
}

function registerColorAndCoordinateTest() {
  it('keeps color parsing and coordinate clamps in their owners', () => {
    expect(parseRasterColor('#abcd')).toEqual([170, 187, 204, 221]);
    expect(parseRasterColor('rgba(0, 255, 0, 0.5)')).toEqual([0, 255, 0, 128]);
    expect(parseRasterColor('definitely-not-a-css-color')).toEqual([0, 0, 0, 255]);
    expect(clampBitmapCoordinate(9.9, 4)).toBe(3);
    expect(clampBitmapCoordinate(-1, 4)).toBe(0);
  });
}

describe('raster bitmap role owners', () => {
  registerCanvasIoTest();
  registerCanvasFailureTest();
  registerImageDimensionFallbackTest();
  registerColorAndCoordinateTest();
});
