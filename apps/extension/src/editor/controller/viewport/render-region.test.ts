// @vitest-environment jsdom

import { Rect } from 'fabric';
import { expect, it, vi } from 'vitest';
import { EditorCanvas } from './render-region';

it('keeps the interactive backing near the viewport instead of the scrollable workspace', () => {
  const surface = document.createElement('div');
  const stage = document.createElement('div');
  const viewport = document.createElement('div');
  const element = document.createElement('canvas');
  surface.append(element);
  stage.append(surface);
  document.body.append(viewport, stage);
  Object.defineProperties(viewport, {
    clientWidth: { value: 800 },
    clientHeight: { value: 600 },
  });
  const canvas = new EditorCanvas(element);
  canvas.setRenderViewport(viewport, stage);
  canvas.setDocumentGeometry({ width: 1920, height: 1080 }, 2048);

  expect(canvas.getWidth()).toBe(800);
  expect(canvas.getHeight()).toBe(600);
  expect(canvas.lowerCanvasEl.width).toBeLessThanOrEqual(1600);
  expect(surface.style.width).toBe('6016px');
  expect(surface.style.height).toBe('5176px');
});

it('projects a far off-image object into the viewport after scrolling', () => {
  const surface = document.createElement('div');
  const stage = document.createElement('div');
  const viewport = document.createElement('div');
  const element = document.createElement('canvas');
  surface.append(element);
  stage.append(surface);
  Object.defineProperties(viewport, {
    clientWidth: { value: 800 },
    clientHeight: { value: 600 },
  });
  surface.getBoundingClientRect = () =>
    ({ left: -700, top: 0, width: 4196, height: 4176 }) as DOMRect;
  viewport.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect;
  const canvas = new EditorCanvas(element);
  canvas.setRenderViewport(viewport, stage);
  canvas.setDocumentGeometry({ width: 100, height: 80 }, 2048);
  const object = new Rect({ left: -1200, top: -1950, width: 60, height: 30 });
  canvas.add(object);
  object.setCoords();
  canvas.upperCanvasEl.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect;

  expect(canvas.wrapperEl.style.left).toBe('700px');
  expect(canvas.viewportTransform).toEqual([1, 0, 0, 1, 1348, 2048]);
  expect(
    canvas.findTarget(new MouseEvent('mousemove', { clientX: 178, clientY: 113 })).target
  ).toBe(object);
});

it('omits outside pixels from interactive rendering while retaining the object for editing', () => {
  const surface = document.createElement('div');
  const viewport = document.createElement('div');
  const element = document.createElement('canvas');
  surface.append(element);
  Object.defineProperties(viewport, {
    clientWidth: { value: 300 },
    clientHeight: { value: 200 },
  });
  const canvas = new EditorCanvas(element);
  canvas.setRenderViewport(viewport, document.createElement('div'));
  canvas.setDocumentGeometry({ width: 100, height: 80 }, 50);
  const outside = new Rect({ left: -35, top: 10, width: 25, height: 20, fill: '#ff0000' });
  canvas.add(outside);
  canvas.renderAll();
  expect(canvas.getContext().getImageData(20, 65, 1, 1).data[3]).toBe(255);

  canvas.setShowOutsideCanvas(false);
  canvas.renderAll();
  expect(canvas.getContext().getImageData(20, 65, 1, 1).data[3]).toBe(0);
  expect(canvas.getObjects()).toContain(outside);
});

it('exports the entire document independent of tile position and zoom', () => {
  const surface = document.createElement('div');
  const viewport = document.createElement('div');
  const element = document.createElement('canvas');
  surface.append(element);
  Object.defineProperties(viewport, {
    clientWidth: { value: 400 },
    clientHeight: { value: 300 },
  });
  surface.getBoundingClientRect = () =>
    ({ left: -200, top: -100, width: 1804, height: 1755 }) as DOMRect;
  viewport.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300 }) as DOMRect;
  const canvas = new EditorCanvas(element);
  canvas.setRenderViewport(viewport, document.createElement('div'));
  canvas.setDocumentGeometry({ width: 100, height: 80 }, 2048);
  canvas.setPresentationScale(0.42);
  canvas.add(new Rect({ left: 30, top: 20, width: 20, height: 20, fill: '#ff0000' }));

  const exported = canvas.renderDocumentCanvas();

  expect(exported.width).toBe(100);
  expect(exported.height).toBe(80);
  expect(Array.from(exported.getContext('2d')!.getImageData(35, 25, 1, 1).data)).toEqual([
    255, 0, 0, 255,
  ]);
});

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
