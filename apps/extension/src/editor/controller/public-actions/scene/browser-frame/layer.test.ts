import { expect, it, vi } from 'vitest';
import { findBrowserFrameLayer, replaceBrowserFrameLayer, resolveBrowserFrameWidth } from './layer';

function createCanvas(objects: unknown[]) {
  return {
    add: vi.fn((object: unknown) => objects.push(object)),
    bringObjectToFront: vi.fn(),
    getObjects: vi.fn(() => objects),
    moveObjectTo: vi.fn(),
    remove: vi.fn((object: unknown) => {
      objects.splice(objects.indexOf(object), 1);
    }),
    setActiveObject: vi.fn(),
  };
}

it('finds browser-frame layers by canonical object metadata', () => {
  const layer = { sniptaleType: 'browser-frame' };
  expect(findBrowserFrameLayer(createCanvas([{ sniptaleType: 'shape' }, layer]) as never)).toBe(
    layer
  );
});

it('replaces an existing browser-frame layer in place', () => {
  const previous = { sniptaleType: 'browser-frame' };
  const next = { setCoords: vi.fn() };
  const objects = [{ id: 'source' }, previous, { id: 'annotation' }];
  const canvas = createCanvas(objects);

  replaceBrowserFrameLayer(canvas as never, previous as never, next as never);

  expect(canvas.remove).toHaveBeenCalledWith(previous);
  expect(canvas.add).toHaveBeenCalledWith(next);
  expect(canvas.moveObjectTo).toHaveBeenCalledWith(next, 1);
  expect(canvas.setActiveObject).toHaveBeenCalledWith(next);
  expect(next.setCoords).toHaveBeenCalledOnce();
});

it('uses existing layer width before source display width', () => {
  expect(resolveBrowserFrameWidth({ getScaledWidth: () => 320 } as never, {} as never)).toBe(320);
  expect(resolveBrowserFrameWidth(null, { displayWidth: 640 } as never)).toBe(640);
});
