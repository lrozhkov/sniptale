import { FabricImage, Rect } from 'fabric';
import { expect, it, vi } from 'vitest';
import { applyEditorRasterEffects, syncEditorRasterEffects } from './raster-effects';

function imageObject(): FabricImage {
  return Object.assign(Object.create(FabricImage.prototype), {
    filters: [],
    applyFilters: vi.fn(),
  });
}

it.each(['image', 'tile'] as const)(
  'does not apply full-source corrections twice to prepared background %s',
  (kind) => {
    const object = kind === 'image' ? imageObject() : new Rect();
    object.sniptaleRole = 'background';
    object.sniptaleEffects = [{ id: 'brightness', amount: 0.5, enabled: true }];
    const apply = object instanceof FabricImage ? vi.spyOn(object, 'applyFilters') : vi.fn();
    syncEditorRasterEffects(object);
    expect(apply).not.toHaveBeenCalled();
    expect(object.sniptaleEffects).toEqual([{ id: 'brightness', amount: 0.5, enabled: true }]);
  }
);

it('retains ordinary image correction synchronization', () => {
  const image = imageObject();
  image.sniptaleEffects = [{ id: 'brightness', amount: 0.5, enabled: true }];
  const apply = vi.spyOn(image, 'applyFilters').mockImplementation(() => undefined);
  syncEditorRasterEffects(image);
  expect(apply).toHaveBeenCalledOnce();
  expect(image.filters).toHaveLength(1);
});

it('preserves accepted correction settings and rendered pixels after a filter failure', () => {
  const image = imageObject();
  const original: HTMLImageElement = Object.create(null);
  const accepted: HTMLCanvasElement = Object.create(null);
  const failed: HTMLCanvasElement = Object.create(null);
  image._originalElement = original;
  image._element = accepted;
  image._filteredEl = accepted;
  const effects = [{ id: 'contrast' as const, amount: 0.2, enabled: true }];
  image.sniptaleEffects = effects;
  const filters = image.filters;
  image.dirty = false;
  let clearedAcceptedPixels = false;
  vi.spyOn(image, 'applyFilters').mockImplementation(() => {
    if (image._filteredEl === accepted) clearedAcceptedPixels = true;
    expect(image._element).toBe(original);
    image.dirty = true;
    image._element = failed;
    image._filteredEl = failed;
    throw new Error('Filter backend failed');
  });
  expect(() =>
    applyEditorRasterEffects(image, [{ id: 'brightness', amount: 0.4, enabled: true }])
  ).toThrow('Filter backend failed');
  expect(image.sniptaleEffects).toBe(effects);
  expect(image.filters).toBe(filters);
  expect(image._element).toBe(accepted);
  expect(image._filteredEl).toBe(accepted);
  expect(clearedAcceptedPixels).toBe(false);
  expect(image.dirty).toBe(false);
});

it('removes all corrections from the original full source', () => {
  const image = imageObject();
  const original: HTMLImageElement = Object.create(null);
  const accepted: HTMLCanvasElement = Object.create(null);
  image._originalElement = original;
  image._element = accepted;
  image._filteredEl = accepted;
  image.sniptaleEffects = [{ id: 'brightness', amount: 0.2, enabled: true }];
  vi.spyOn(image, 'applyFilters').mockImplementation(() => {
    expect(image._element).toBe(original);
    expect(image._filteredEl).toBeUndefined();
    expect(image.filters).toEqual([]);
  });
  applyEditorRasterEffects(image, []);
  expect(image.sniptaleEffects).toEqual([]);
  expect(image._element).toBe(original);
});
