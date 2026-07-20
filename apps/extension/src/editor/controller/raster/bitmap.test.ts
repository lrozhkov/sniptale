// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canvasToRasterDataUrl,
  clampBitmapCoordinate,
  createRasterCanvas,
  getRasterImageData,
  loadRasterCanvasFromDataUrl,
  parseRasterColor,
  putRasterImageData,
} from './bitmap';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('editor-controller/raster/bitmap canvas helpers', () => {
  it('creates raster canvases, reads/writes pixels, and serializes to data urls', () => {
    const canvas = createRasterCanvas(3.4, 4.6);
    expect(canvas.width).toBe(3);
    expect(canvas.height).toBe(5);

    const imageData = getRasterImageData(canvas);
    putRasterImageData(canvas, imageData);
    expect(canvasToRasterDataUrl(canvas)).toContain('data:image/png');
  });
});

describe('editor-controller/raster/bitmap parsing helpers', () => {
  it('parses raster colors and clamps bitmap coordinates', async () => {
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

    expect(parseRasterColor('#123')).toEqual([17, 34, 51, 255]);
    expect(parseRasterColor('rgb(255, 0, 0)')).toEqual([255, 0, 0, 255]);
    expect(parseRasterColor('rgba(0, 255, 0, 0.5)')).toEqual([0, 255, 0, 128]);
    expect(clampBitmapCoordinate(9.9, 4)).toBe(3);
    expect(clampBitmapCoordinate(-1, 4)).toBe(0);

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => new ImageData(1, 1)),
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D);

    const canvas = await loadRasterCanvasFromDataUrl('data:image/png;base64,abc');
    expect(canvas.width).toBe(3);
    expect(canvas.height).toBe(2);
  });

  it('supports extended hex parsing and falls back safely for invalid colors', () => {
    expect(parseRasterColor('#abcd')).toEqual([170, 187, 204, 221]);
    expect(parseRasterColor('#11223344')).toEqual([17, 34, 51, 68]);
    expect(parseRasterColor('not-a-color')).toEqual([0, 0, 0, 255]);
    expect(parseRasterColor('definitely-not-a-css-color')).toEqual([0, 0, 0, 255]);
  });
});
