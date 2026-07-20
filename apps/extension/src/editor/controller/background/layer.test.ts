import { Rect } from 'fabric';
import { expect, it, vi } from 'vitest';

import { replaceBackgroundLayer } from './layer';

function createCanvas(objects: Rect[] = []) {
  return {
    add: vi.fn((object: Rect) => objects.push(object)),
    getObjects: () => objects,
    moveObjectTo: vi.fn((object: Rect, index: number) => {
      const currentIndex = objects.indexOf(object);
      objects.splice(currentIndex, 1);
      objects.splice(index, 0, object);
    }),
    remove: vi.fn((object: Rect) => {
      const index = objects.indexOf(object);
      objects.splice(index, 1);
    }),
    sendObjectToBack: vi.fn((object: Rect) => {
      const index = objects.indexOf(object);
      objects.splice(index, 1);
      objects.unshift(object);
    }),
  };
}

it('replaces an existing background layer at the same canvas index', () => {
  const first = new Rect({});
  const previous = new Rect({});
  const last = new Rect({});
  const next = new Rect({});
  const canvas = createCanvas([first, previous, last]);

  replaceBackgroundLayer(canvas as never, previous, next);

  expect(canvas.getObjects()).toEqual([first, next, last]);
  expect(canvas.remove).toHaveBeenCalledWith(previous);
  expect(canvas.moveObjectTo).toHaveBeenCalledWith(next, 1);
});

it('sends new background layers behind existing objects', () => {
  const source = new Rect({});
  const next = new Rect({});
  const canvas = createCanvas([source]);

  replaceBackgroundLayer(canvas as never, undefined, next);

  expect(canvas.getObjects()).toEqual([next, source]);
  expect(canvas.sendObjectToBack).toHaveBeenCalledWith(next);
});
