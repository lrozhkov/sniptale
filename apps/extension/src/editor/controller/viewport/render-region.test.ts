// @vitest-environment jsdom

import { Rect } from 'fabric';
import { expect, it, vi } from 'vitest';
import { EditorCanvas } from './render-region';
import { selectEditorLayerById } from '../public-actions/selection/layers/select';
import { prepareCanvasForDocumentLoad } from '../document/apply/canvas';

it('keeps replacement documents centered after crop, image resize, undo, and redo', () => {
  const surface = document.createElement('div');
  const viewport = document.createElement('div');
  const element = document.createElement('canvas');
  surface.append(element);
  Object.defineProperties(viewport, {
    clientWidth: { value: 800 },
    clientHeight: { value: 600 },
    scrollLeft: { value: 0, writable: true },
    scrollTop: { value: 0, writable: true },
  });
  const canvas = new EditorCanvas(element);
  canvas.setRenderViewport(viewport, document.createElement('div'));
  canvas.setDocumentGeometry({ width: 8000, height: 7000 }, 512);
  canvas.prepareWorkspaceForCrop({ left: 6000, top: 5000, width: 2000, height: 1000 });
  canvas.setDocumentGeometry({ width: 2000, height: 1000 }, 2048);
  viewport.scrollLeft = 7112;
  viewport.scrollTop = 5712;

  prepareCanvasForDocumentLoad({ canvas, canvasSize: { width: 1200, height: 600 }, zoomLevel: 1 });
  expect(viewport.scrollLeft).toBe(2248);
  expect(viewport.scrollTop).toBe(2048);

  prepareCanvasForDocumentLoad({ canvas, canvasSize: { width: 2000, height: 1000 }, zoomLevel: 1 });
  expect(viewport.scrollLeft).toBe(2648);
  expect(viewport.scrollTop).toBe(2248);

  prepareCanvasForDocumentLoad({ canvas, canvasSize: { width: 1200, height: 600 }, zoomLevel: 1 });
  expect(viewport.scrollLeft).toBe(2248);
  expect(viewport.scrollTop).toBe(2048);
});

it('keeps a panned drawing at the same screen position while history restores the canvas', () => {
  const surface = document.createElement('div');
  const viewport = document.createElement('div');
  const element = document.createElement('canvas');
  surface.append(element);
  Object.defineProperties(viewport, {
    clientWidth: { value: 800 },
    clientHeight: { value: 600 },
    scrollLeft: { value: 0, writable: true },
    scrollTop: { value: 0, writable: true },
  });
  const canvas = new EditorCanvas(element);
  canvas.setRenderViewport(viewport, document.createElement('div'));
  canvas.setDocumentGeometry({ width: 1200, height: 900 }, 2048);
  canvas.setDocumentGeometry({ width: 1200, height: 900 }, 2048);
  viewport.scrollLeft = 2340;
  viewport.scrollTop = 2170;

  prepareCanvasForDocumentLoad({
    canvas,
    canvasSize: { width: 1200, height: 900 },
    zoomLevel: 1,
    preserveViewport: true,
  });

  expect(viewport.scrollLeft).toBe(2340);
  expect(viewport.scrollTop).toBe(2170);
});

it('keeps painted backing beyond both visible edges while panning with scrollbar gutters', () => {
  const surface = document.createElement('div');
  const viewport = document.createElement('div');
  const element = document.createElement('canvas');
  surface.append(element);
  Object.defineProperties(viewport, {
    clientLeft: { value: 15 },
    clientWidth: { value: 770 },
    clientHeight: { value: 580 },
    offsetWidth: { value: 800 },
    offsetHeight: { value: 600 },
  });
  let surfaceLeft = -200;
  let scale = 1;
  surface.getBoundingClientRect = () =>
    ({
      left: surfaceLeft,
      right: surfaceLeft + 4196 * scale,
      top: 0,
      width: 4196 * scale,
      height: 4176 * scale,
    }) as DOMRect;
  viewport.getBoundingClientRect = () =>
    ({ left: 0, right: 800, top: 0, width: 800, height: 600 }) as DOMRect;

  const canvas = new EditorCanvas(element);
  canvas.setRenderViewport(viewport, document.createElement('div'));
  canvas.setDocumentGeometry({ width: 100, height: 80 }, 2048);

  const expectPaintedEdges = (leftInset: number, rightInset: number) => {
    const wrapperLeft = surfaceLeft + Number.parseFloat(canvas.wrapperEl.style.left);
    expect(wrapperLeft).toBeLessThanOrEqual(15 - leftInset);
    expect(wrapperLeft + canvas.width).toBeGreaterThanOrEqual(785 + rightInset);
    expect(wrapperLeft + canvas.viewportTransform[4]).toBeCloseTo(surfaceLeft + 2048 * scale);
  };

  expectPaintedEdges(2, 2);
  surfaceLeft = -3381;
  canvas.refreshVirtualViewport();
  expectPaintedEdges(2, 2);
  surfaceLeft = -3411;
  canvas.refreshVirtualViewport();
  expectPaintedEdges(2, 0);
  scale = 0.75;
  surfaceLeft = -200;
  canvas.setPresentationScale(scale);
  expectPaintedEdges(2, 2);
});

it('targets a selected lower layer through overlapping artwork until selection clears', () => {
  const canvas = new EditorCanvas(document.createElement('canvas'), {
    preserveObjectStacking: true,
  });
  canvas.setDimensions({ width: 300, height: 200 });
  canvas.upperCanvasEl.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 300, height: 200 }) as DOMRect;
  const lower = new Rect({ left: 30, top: 30, width: 100, height: 80, fill: '#f00' });
  const upper = new Rect({ left: 30, top: 30, width: 100, height: 80, fill: '#00f' });
  lower.sniptaleId = 'lower';
  upper.sniptaleId = 'upper';
  canvas.add(lower, upper);
  lower.setCoords();
  upper.setCoords();
  const pointer = new MouseEvent('mousedown', { clientX: 60, clientY: 60 });
  expect(canvas.findTarget(pointer).target).toBe(upper);

  selectEditorLayerById({
    canvas,
    id: 'lower',
    ensureObjectReachable: () => false,
    focusObjectInViewport: () => undefined,
    commitHistory: () => undefined,
    syncRuntimeState: () => undefined,
  });

  expect(canvas.getActiveObject()).toBe(lower);
  expect(canvas.findTarget(pointer).target).toBe(lower);
  expect(canvas.preserveObjectStacking).toBe(true);

  canvas.setActiveObject(upper);
  canvas.setActiveObject(lower);
  expect(canvas.findTarget(pointer).target).toBe(upper);

  canvas.discardActiveObject();
  expect(canvas.findTarget(pointer).target).toBe(upper);
});

it('restores the same document point under the viewport after a size-changing undo', () => {
  const surface = document.createElement('div');
  const viewport = document.createElement('div');
  const element = document.createElement('canvas');
  surface.append(element);
  Object.defineProperties(viewport, {
    clientWidth: { value: 800 },
    clientHeight: { value: 600 },
    scrollLeft: { value: 2300, writable: true },
    scrollTop: { value: 2200, writable: true },
  });
  const canvas = new EditorCanvas(element);
  canvas.setRenderViewport(viewport, document.createElement('div'));
  canvas.setDocumentGeometry({ width: 1200, height: 900 }, 2048);
  const position = canvas.captureDocumentViewportPosition()!;

  prepareCanvasForDocumentLoad({
    canvas,
    canvasSize: { width: 1800, height: 1100 },
    zoomLevel: 1,
    preserveViewport: true,
  });
  canvas.restoreDocumentViewportPosition(position);

  expect(canvas.captureDocumentViewportPosition()).toEqual(position);
  expect(viewport.scrollLeft).toBe(2300);
  expect(viewport.scrollTop).toBe(2200);
});

it('keeps a far panned position reachable when history restores a smaller document', () => {
  const surface = document.createElement('div');
  const viewport = document.createElement('div');
  const element = document.createElement('canvas');
  surface.append(element);
  Object.defineProperties(viewport, {
    clientWidth: { value: 800 },
    clientHeight: { value: 600 },
    scrollLeft: { value: 7000, writable: true },
    scrollTop: { value: 6000, writable: true },
  });
  const canvas = new EditorCanvas(element);
  canvas.setRenderViewport(viewport, document.createElement('div'));
  canvas.setDocumentGeometry({ width: 8000, height: 7000 }, 512);
  const position = canvas.captureDocumentViewportPosition()!;

  prepareCanvasForDocumentLoad({
    canvas,
    canvasSize: { width: 1000, height: 800 },
    zoomLevel: 1,
    preserveViewport: true,
  });
  canvas.restoreDocumentViewportPosition(position);

  expect(canvas.captureDocumentViewportPosition()).toEqual(position);
  expect(Number.parseFloat(surface.style.width)).toBeGreaterThanOrEqual(viewport.scrollLeft + 800);
  expect(Number.parseFloat(surface.style.height)).toBeGreaterThanOrEqual(viewport.scrollTop + 600);
});

it('makes restored off-image layers reachable without changing their document positions', () => {
  const surface = document.createElement('div');
  const viewport = document.createElement('div');
  const element = document.createElement('canvas');
  surface.append(element);
  Object.defineProperties(viewport, {
    clientWidth: { value: 800 },
    clientHeight: { value: 600 },
  });
  const canvas = new EditorCanvas(element);
  canvas.setRenderViewport(viewport, document.createElement('div'));
  const restoredLayer = new Rect({ left: -6000, top: -5000, width: 50, height: 40 });
  canvas.add(restoredLayer);

  prepareCanvasForDocumentLoad({ canvas, canvasSize: { width: 2000, height: 1000 }, zoomLevel: 1 });

  expect(canvas.getWorkspaceInsets().left).toBeGreaterThan(6000);
  expect(canvas.getWorkspaceInsets().top).toBeGreaterThan(5000);
  expect(restoredLayer.left).toBe(-6000);
  expect(restoredLayer.top).toBe(-5000);
});

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

  expect(canvas.getWidth()).toBe(804);
  expect(canvas.getHeight()).toBe(604);
  expect(canvas.lowerCanvasEl.width).toBeLessThanOrEqual(1608);
  expect(surface.style.width).toBe('6016px');
  expect(surface.style.height).toBe('5176px');
});

it('adds scrollable crop workspace at an approached edge without increasing the raster backing', () => {
  const surface = document.createElement('div');
  const viewport = document.createElement('div');
  const element = document.createElement('canvas');
  surface.append(element);
  Object.defineProperties(viewport, {
    clientWidth: { value: 800 },
    clientHeight: { value: 600 },
    scrollLeft: { value: 0, writable: true },
    scrollTop: { value: 0, writable: true },
  });
  const canvas = new EditorCanvas(element);
  canvas.setRenderViewport(viewport, document.createElement('div'));
  canvas.setDocumentGeometry({ width: 100, height: 80 }, 2048);
  canvas.setExpandingCanvasWorkspace(true);
  const initialWidth = Number.parseFloat(surface.style.width);

  expect(canvas.extendWorkspaceAtScrollEdge()).toBe(true);
  expect(canvas.getWorkspaceInsets().left).toBeGreaterThan(2048);
  expect(viewport.scrollLeft).toBeGreaterThan(0);
  expect(Number.parseFloat(surface.style.width)).toBeGreaterThan(initialWidth);
  expect(canvas.getWidth()).toBe(804);
});

it('keeps the same workspace span across repeated canvas expansion applies', () => {
  const surface = document.createElement('div');
  const viewport = document.createElement('div');
  const element = document.createElement('canvas');
  surface.append(element);
  Object.defineProperties(viewport, {
    clientWidth: { value: 800 },
    clientHeight: { value: 600 },
  });
  const canvas = new EditorCanvas(element);
  canvas.setRenderViewport(viewport, document.createElement('div'));
  canvas.setDocumentGeometry({ width: 100, height: 80 }, 2048);
  const initialWidth = surface.style.width;

  canvas.prepareWorkspaceForCrop({ left: -100, top: 0, width: 300, height: 80 });
  canvas.setDocumentGeometry({ width: 300, height: 80 }, 2048);
  expect(surface.style.width).toBe(initialWidth);
  expect(canvas.getWorkspaceInsets()).toEqual({ left: 1948, top: 2048, right: 1948, bottom: 2048 });

  canvas.prepareWorkspaceForCrop({ left: -100, top: 0, width: 500, height: 80 });
  canvas.setDocumentGeometry({ width: 500, height: 80 }, 2048);
  expect(surface.style.width).toBe(initialWidth);
  expect(canvas.getWidth()).toBe(804);
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

  expect(canvas.wrapperEl.style.left).toBe('698px');
  expect(canvas.viewportTransform).toEqual([1, 0, 0, 1, 1350, 2048]);
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
