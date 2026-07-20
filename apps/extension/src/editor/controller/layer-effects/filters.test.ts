import { beforeEach, expect, it, vi } from 'vitest';

const applyFiltersMock = vi.fn();

vi.mock('fabric', () => {
  class FabricImage {
    filters: unknown[] = [];
    sniptaleEffects: unknown[] = [];
    applyFilters = applyFiltersMock;
  }

  const createFilterClass = (type: string) =>
    class {
      type = type;
      options: Record<string, unknown>;

      constructor(options: Record<string, unknown> = {}) {
        this.options = options;
      }
    };

  return {
    FabricImage,
    filters: {
      BlackWhite: createFilterClass('BlackWhite'),
      BlendColor: createFilterClass('BlendColor'),
      Blur: createFilterClass('Blur'),
      Brightness: createFilterClass('Brightness'),
      Brownie: createFilterClass('Brownie'),
      Contrast: createFilterClass('Contrast'),
      Convolute: createFilterClass('Convolute'),
      Gamma: createFilterClass('Gamma'),
      Grayscale: createFilterClass('Grayscale'),
      HueRotation: createFilterClass('HueRotation'),
      Invert: createFilterClass('Invert'),
      Kodachrome: createFilterClass('Kodachrome'),
      Noise: createFilterClass('Noise'),
      Pixelate: createFilterClass('Pixelate'),
      Polaroid: createFilterClass('Polaroid'),
      Saturation: createFilterClass('Saturation'),
      Sepia: createFilterClass('Sepia'),
      Technicolor: createFilterClass('Technicolor'),
      Vibrance: createFilterClass('Vibrance'),
      Vintage: createFilterClass('Vintage'),
    },
  };
});

import { FabricImage } from 'fabric';
import {
  applyEditorRasterEffects,
  isEditorRasterObject,
  previewEditorRasterEffects,
  syncEditorRasterEffects,
} from './filters';

function createImage() {
  return new FabricImage({} as never) as FabricImage & {
    filters: unknown[];
    sniptaleEffects: unknown[];
  };
}

beforeEach(() => {
  applyFiltersMock.mockClear();
});

it('identifies raster objects and maps adjustment/effect filters onto fabric images', () => {
  const image = createImage();
  applyEditorRasterEffects(
    image as never,
    [
      { amount: 0.2, enabled: true, id: 'brightness' },
      { amount: 0.4, enabled: true, id: 'contrast' },
      { blue: 1, enabled: true, green: 1, id: 'gamma', red: 1.2 },
      { rotation: 0.3, enabled: true, id: 'hue' },
      { amount: 0.3, enabled: true, id: 'saturation' },
      { amount: 0.2, enabled: true, id: 'vibrance' },
      { enabled: true, id: 'invert' },
      { enabled: true, id: 'grayscale' },
      { enabled: true, id: 'sepia' },
      { alpha: 0.5, color: '#ff00ff', enabled: true, id: 'colorize' },
      { blur: 0.2, enabled: true, id: 'blur' },
      { enabled: true, id: 'noise', noise: 30 },
      { blocksize: 5, enabled: true, id: 'pixelate' },
      { enabled: true, id: 'sharpen' },
      { enabled: true, id: 'emboss' },
      { enabled: true, id: 'edge-detect' },
      { enabled: true, id: 'black-white' },
      { enabled: true, id: 'vintage' },
      { enabled: true, id: 'brownie' },
      { enabled: true, id: 'polaroid' },
      { enabled: true, id: 'kodachrome' },
      { enabled: true, id: 'technicolor' },
      { amount: 0.9, enabled: false, id: 'brightness' },
    ] as never
  );

  expect(isEditorRasterObject(image as never)).toBe(true);
  expect(isEditorRasterObject({} as never)).toBe(false);
  expect(applyFiltersMock).toHaveBeenCalledOnce();
  expect(Array.isArray(image.filters)).toBe(true);
  expect(image.filters).toHaveLength(22);
  expect(image.sniptaleEffects).not.toBeUndefined();
});

it('reapplies a stored effect stack only for raster objects', () => {
  const image = createImage();
  image.sniptaleEffects = [{ blur: 0.3, enabled: true, id: 'blur' }];

  syncEditorRasterEffects(image as never);
  syncEditorRasterEffects({ sniptaleEffects: [{ enabled: true, id: 'sepia' }] } as never);

  expect(applyFiltersMock).toHaveBeenCalledOnce();
});

it('applies preview filters without replacing committed raster effects', () => {
  const image = createImage();
  image.sniptaleEffects = [{ amount: 0.1, enabled: true, id: 'brightness' } as never];

  previewEditorRasterEffects(
    image as never,
    [{ amount: 0.8, enabled: true, id: 'contrast' }] as never
  );

  expect(applyFiltersMock).toHaveBeenCalledOnce();
  expect(image.sniptaleEffects).toEqual([{ amount: 0.1, enabled: true, id: 'brightness' }]);
  expect(image.filters).toHaveLength(1);
});
