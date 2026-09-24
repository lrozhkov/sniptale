// @vitest-environment jsdom

import { Rect } from 'fabric';
import { expect, it, vi } from 'vitest';
import { EditorCanvas } from './render-region';

it('clears and paints only the visible part of the interactive canvases', () => {
  const canvas = new EditorCanvas(document.createElement('canvas'));
  const viewport = document.createElement('div');
  canvas.setDimensions({ width: 2000, height: 1600 });
  canvas.lowerCanvasEl.getBoundingClientRect = () =>
    ({ left: -400, top: -300, right: 1600, bottom: 1300, width: 2000, height: 1600 }) as DOMRect;
  viewport.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 500, bottom: 400, width: 500, height: 400 }) as DOMRect;
  canvas.setRenderViewport(viewport);
  const lowerClear = vi.spyOn(canvas.getContext(), 'clearRect');
  const upperClear = vi.spyOn(canvas.contextTop, 'clearRect');

  canvas.contextTopDirty = true;
  canvas.renderAll();

  expect(lowerClear).toHaveBeenCalledWith(398, 298, 504, 404);
  expect(upperClear).toHaveBeenCalledWith(398, 298, 504, 404);
  expect(lowerClear).not.toHaveBeenCalledWith(0, 0, 2000, 1600);

  canvas.lowerCanvasEl.getBoundingClientRect = () =>
    ({ left: -1000, top: -300, right: 1000, bottom: 1300, width: 2000, height: 1600 }) as DOMRect;
  lowerClear.mockClear();
  canvas.renderAll();
  expect(lowerClear).toHaveBeenCalledWith(998, 298, 504, 404);
});

it('keeps export rendering independent of the visible viewport', () => {
  const canvas = new EditorCanvas(document.createElement('canvas'));
  const viewport = document.createElement('div');
  canvas.setDimensions({ width: 2000, height: 1600 });
  canvas.lowerCanvasEl.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 2000, bottom: 1600, width: 2000, height: 1600 }) as DOMRect;
  viewport.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 500, bottom: 400, width: 500, height: 400 }) as DOMRect;
  canvas.setRenderViewport(viewport);
  canvas.add(new Rect({ left: 550, top: 450, width: 40, height: 30, fill: '#ff0000' }));
  const exported = canvas.toCanvasElement(1, { left: 500, top: 400, width: 100, height: 80 });

  expect(exported.width).toBe(100);
  expect(exported.height).toBe(80);
  expect(Array.from(exported.getContext('2d')!.getImageData(60, 60, 1, 1).data)).toEqual([
    255, 0, 0, 255,
  ]);
});
