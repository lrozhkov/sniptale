// @vitest-environment jsdom

import { ActiveSelection, Group, Rect, Textbox } from 'fabric';
import {
  beginEditorSelectionModifierGesture,
  finishEditorSelectionModifierGesture,
} from '../../controller/events/selection-modifiers';
import { prepareEditorObject } from '../../controller/document/objects/prepare';
import { handleEditorWindowKeyDown } from '../../controller/input/window-events';
import { createEditorDrawingFabricObject } from '../../drawing/object/vector';
import { collectLayers } from '../../controller/document/layers';
import { handleEditorDoubleClick } from '../../controller/input/double-click';
import { cancelEditorTransientInteraction } from '../../controller/input/canvas-actions/transient';
import { duplicateEditorSelection } from '../../controller/public-actions/selection/objects/duplicate';
import { deleteEditorSelection } from '../../controller/public-actions/selection/objects/delete';
import { nudgeEditorSelection } from '../../controller/public-actions/selection/objects/nudge';
import {
  moveLayerSelection,
  moveLayerSelectionToEdge,
} from '../../controller/layer-actions/reorder/selection';
import {
  groupSelectedEditorLayers,
  ungroupSelectedEditorLayers,
} from '../../controller/layer-actions/group';
import { afterEach, expect, it, vi } from 'vitest';
import { EditorCanvas } from './render-region';
import { selectEditorLayerById } from '../../controller/public-actions/selection/layers/select';
import { prepareCanvasForDocumentLoad } from '../../controller/document/apply/canvas';

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
  expect(canvas.getContext().getImageData(20, 65, 1, 1).data[3]).toBe(0);

  canvas.setShowOutsideCanvas(true);
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

it('previews only unselected editable hover targets without changing selection or controls', () => {
  const canvas = new EditorCanvas(undefined, { renderOnAddRemove: false });
  const object = new Rect({ left: 10, top: 10, width: 40, height: 30 });
  object.sniptaleId = 'shape';
  object.sniptaleType = 'shape';
  canvas.add(object);
  expect(canvas.getSelectionPreviewObjects(object)).toEqual([object]);
  expect(canvas.getActiveObjects()).toEqual([]);
  expect(object.hasControls).toBe(true);
  canvas.setActiveObject(object);
  expect(canvas.getSelectionPreviewObjects(object)).toEqual([]);
  canvas.discardActiveObject();
  object.sniptaleLocked = true;
  expect(canvas.getSelectionPreviewObjects(object)).toEqual([]);
  object.sniptaleLocked = false;
  canvas.selection = false;
  expect(canvas.getSelectionPreviewObjects(object)).toEqual([]);
  canvas.dispose();
});

it('previews the same fully-contained marquee candidates in both drag directions', () => {
  class MarqueeCanvas extends EditorCanvas {
    marquee(x: number, y: number, deltaX: number, deltaY: number) {
      this._groupSelector = { x, y, deltaX, deltaY };
    }
  }
  const canvas = new MarqueeCanvas(undefined, { renderOnAddRemove: false });
  const inside = new Rect({ left: 35, top: 35, width: 30, height: 20 });
  const partial = new Rect({ left: 75, top: 20, width: 60, height: 30 });
  const hidden = new Rect({ left: 20, top: 20, width: 10, height: 10, visible: false });
  const locked = new Rect({ left: 20, top: 20, width: 10, height: 10 });
  locked.sniptaleLocked = true;
  canvas.add(inside, partial, hidden, locked);
  canvas.marquee(10, 10, 90, 70);
  expect(canvas.getSelectionPreviewObjects(partial)).toEqual([inside]);
  canvas.marquee(100, 80, -90, -70);
  expect(canvas.getSelectionPreviewObjects(partial)).toEqual([inside]);
  canvas.marquee(10, 10, 0, 0);
  expect(canvas.getSelectionPreviewObjects(inside)).toEqual([]);
  expect(canvas.getActiveObjects()).toEqual([]);
  canvas.dispose();
});

const nestedSelectionCanvases: EditorCanvas[] = [];
afterEach(async () => {
  await Promise.all(nestedSelectionCanvases.splice(0).map((canvas) => canvas.dispose()));
});

function createNestedSelectionCanvas() {
  const first = new Rect({ left: 30, top: 30, width: 40, height: 30 });
  const second = new Rect({ left: 110, top: 70, width: 30, height: 30 });
  first.sniptaleId = 'nested-first';
  second.sniptaleId = 'nested-second';
  first.sniptaleType = second.sniptaleType = 'shape';
  const group = new Group([first, second], { angle: 30, scaleX: 1.5, scaleY: 1.5 });
  group.sniptaleId = 'parent-group';
  group.sniptaleType = 'group';
  const canvas = new EditorCanvas(document.createElement('canvas'), {
    width: 800,
    height: 600,
    preserveObjectStacking: true,
    selectionFullyContained: true,
  });
  canvas.add(group);
  nestedSelectionCanvases.push(canvas);
  const history = vi.fn();
  const sync = vi.fn();
  const commands = {
    canvas,
    commitHistory: history,
    syncRuntimeState: sync,
    prepareObject: vi.fn(),
  };
  return { canvas, first, second, group, history, sync, commands };
}

it('enters nested siblings, retains native target metadata, and leaves one level with Escape', () => {
  const { canvas, first, second, group, history, sync } = createNestedSelectionCanvas();
  canvas.setActiveObject(group);
  const point = first.getCenterPoint();
  const event = new MouseEvent('dblclick', { clientX: point.x, clientY: point.y });
  handleEditorDoubleClick({
    canvas,
    target: group,
    event,
    activeTool: 'select',
    commitHistory: history,
    syncRuntimeState: sync,
  });
  expect(canvas.getSelectionGroupScope()).toBe(group);
  expect(canvas.getActiveObject()).toBe(first);
  expect(group.interactive).toBe(false);
  expect(group.subTargetCheck).toBe(false);
  const other = second.getCenterPoint();
  expect(
    canvas.findTarget(new MouseEvent('mousemove', { clientX: other.x, clientY: other.y }))
  ).toMatchObject({ target: second, currentTarget: second, container: second });
  const result = cancelEditorTransientInteraction({
    canvas,
    drawSession: null,
    cropGuide: null,
    activeTool: 'select',
    clearCropSelection: vi.fn(),
    switchToSelectTool: vi.fn(),
    syncRuntimeState: sync,
  });
  expect(result.changed).toBe(true);
  expect(canvas.getActiveObject()).toBe(group);
  expect(canvas.getSelectionGroupScope()).toBeNull();
  expect(history).not.toHaveBeenCalled();
});

it('selects a tree child without selecting its parent and scopes additive selection to siblings', () => {
  const { canvas, first, second, group, commands } = createNestedSelectionCanvas();
  const select = (id: string, additive = false) =>
    selectEditorLayerById({
      ...commands,
      id,
      selectionOptions: { additive, focusViewport: false },
      ensureObjectReachable: () => false,
      focusObjectInViewport: vi.fn(),
    });
  expect(select(first.sniptaleId!)).toBe(true);
  expect(canvas.getActiveObject()).toBe(first);
  expect(canvas.getSelectionGroupScope()).toBe(group);
  expect(collectLayers(canvas)[0]).toMatchObject({
    selected: false,
    containsSelection: true,
    groupChildren: expect.arrayContaining([
      expect.objectContaining({ id: first.sniptaleId, selected: true }),
    ]),
  });
  select(second.sniptaleId!, true);
  expect(canvas.getActiveObjects()).toEqual([first, second]);
  select(group.sniptaleId!, true);
  expect(canvas.getActiveObjects()).toEqual([group]);
});

it('keeps scoped marquee and nested hover within the live document and rejects locked ancestors', () => {
  const { canvas, first, second, group } = createNestedSelectionCanvas();
  expect(canvas.getSelectionPreviewObjects(first)).toEqual([first]);
  canvas.enterSelectionGroup(group);
  const bounds = group.getBoundingRect();
  expect(
    canvas.collectObjects(
      {
        left: bounds.left - 1,
        top: bounds.top - 1,
        width: bounds.width + 2,
        height: bounds.height + 2,
      },
      { includeIntersecting: false }
    )
  ).toEqual([second, first]);
  group.sniptaleLocked = true;
  expect(canvas.getSelectionGroupScope()).toBeNull();
  expect(canvas.getSelectionPreviewObjects(first)).toEqual([]);
  expect(canvas.enterSelectionGroup(group)).toBe(false);
  group.sniptaleLocked = false;
  canvas.enterSelectionGroup(group);
  canvas.remove(group);
  expect(canvas.getSelectionGroupScope()).toBeNull();
  expect(canvas.getSelectionPreviewObjects(first)).toEqual([]);
});

it('duplicates and nudges a nested child in scene coordinates, then deletes it from its parent', async () => {
  const { canvas, first, second, group, commands, history } = createNestedSelectionCanvas();
  canvas.enterSelectionGroup(group);
  canvas.setActiveObject(first);
  const original = first.getCenterPoint();
  const sibling = second.getCenterPoint();
  await duplicateEditorSelection({ ...commands, nextLabelIndex: () => 2 });
  const clone = canvas.getActiveObject()!;
  expect(clone.parent).toBe(group);
  expect(group.getObjects()).toHaveLength(3);
  expect(clone.getCenterPoint().x).toBeCloseTo(original.x + 24, 5);
  expect(clone.getCenterPoint().y).toBeCloseTo(original.y + 24, 5);
  nudgeEditorSelection({
    ...commands,
    deltaX: 10,
    deltaY: -4,
    source: null,
    setSource: vi.fn(),
    ensureObjectReachable: () => false,
  });
  expect(clone.getCenterPoint().x).toBeCloseTo(original.x + 34, 5);
  expect(clone.getCenterPoint().y).toBeCloseTo(original.y + 20, 5);
  deleteEditorSelection(commands);
  expect(group.getObjects()).toEqual([first, second]);
  expect(first.getCenterPoint().distanceFrom(original)).toBeLessThan(0.00001);
  expect(second.getCenterPoint().distanceFrom(sibling)).toBeLessThan(0.00001);
  expect(canvas.getObjects()).toEqual([group]);
  expect(history).toHaveBeenCalledTimes(2);
});

it('reorders, groups and ungroups nested siblings without moving them or changing root order', () => {
  const { canvas, first, second, group, commands, history } = createNestedSelectionCanvas();
  canvas.enterSelectionGroup(group);
  canvas.setActiveObject(first);
  const before = [first.getCenterPoint(), second.getCenterPoint()];
  expect(moveLayerSelectionToEdge(canvas, 'front')).toBe(true);
  expect(group.getObjects()).toEqual([second, first]);
  expect(moveLayerSelection(canvas, -1)).toBe(true);
  expect(group.getObjects()).toEqual([first, second]);
  canvas.setActiveObject(new ActiveSelection([first, second], { canvas }));
  expect(groupSelectedEditorLayers(commands)).toBe(true);
  const nested = canvas.getActiveObject()!;
  expect(nested.parent).toBe(group);
  expect(group.getObjects()).toEqual([nested]);
  expect(first.getCenterPoint().distanceFrom(before[0]!)).toBeLessThan(0.00001);
  expect(second.getCenterPoint().distanceFrom(before[1]!)).toBeLessThan(0.00001);
  expect(ungroupSelectedEditorLayers(commands)).toBe(true);
  expect(group.getObjects()).toEqual([first, second]);
  expect(canvas.getObjects()).toEqual([group]);
  expect(first.getCenterPoint().distanceFrom(before[0]!)).toBeLessThan(0.00001);
  expect(history).toHaveBeenCalledTimes(2);
});

it.each([false, true])(
  'fully contains scoped marquee candidates in either direction (reverse: %s)',
  (reverse) => {
    const { canvas, first, second, group } = createNestedSelectionCanvas();
    canvas.enterSelectionGroup(group);
    const bounds = group.getBoundingRect();
    const left = bounds.left - 5;
    const top = bounds.top - 5;
    const right = bounds.left + bounds.width + 5;
    const bottom = bounds.top + bounds.height + 5;
    const start = reverse ? { x: right, y: bottom } : { x: left, y: top };
    const end = reverse ? { x: left, y: top } : { x: right, y: bottom };
    canvas.__onMouseDown(new MouseEvent('mousedown', { clientX: start.x, clientY: start.y }));
    canvas.__onMouseMove(
      new MouseEvent('mousemove', { clientX: end.x, clientY: end.y, buttons: 1 })
    );
    expect(new Set(canvas.getSelectionPreviewObjects())).toEqual(new Set([first, second]));
    canvas.__onMouseUp(new MouseEvent('mouseup', { clientX: end.x, clientY: end.y }));
    expect(new Set(canvas.getActiveObjects())).toEqual(new Set([first, second]));
    expect(canvas.getSelectionGroupScope()).toBe(group);
  }
);

it('cancels a native marquee before group exit, restores accepted selection, and ignores modifier completion', () => {
  const { canvas, first, second, group, sync } = createNestedSelectionCanvas();
  canvas.enterSelectionGroup(group);
  canvas.setActiveObject(first);
  const bounds = group.getBoundingRect();
  const down = new MouseEvent('mousedown', {
    clientX: bounds.left - 10,
    clientY: bounds.top - 10,
    ctrlKey: true,
  });
  const gesture = beginEditorSelectionModifierGesture({
    canvas,
    event: down,
    activeTool: 'select',
  });
  canvas.__onMouseDown(down);
  canvas.__onMouseMove(
    new MouseEvent('mousemove', {
      clientX: bounds.left + bounds.width + 10,
      clientY: bounds.top + bounds.height + 10,
      buttons: 1,
      ctrlKey: true,
    })
  );
  expect(new Set(canvas.getSelectionPreviewObjects())).toEqual(new Set([first, second]));
  cancelEditorTransientInteraction({
    canvas,
    drawSession: null,
    cropGuide: null,
    activeTool: 'select',
    clearCropSelection: vi.fn(),
    switchToSelectTool: vi.fn(),
    syncRuntimeState: sync,
  });
  expect(canvas.getActiveObjects()).toEqual([first]);
  expect(canvas.getSelectionGroupScope()).toBe(group);
  canvas.__onMouseUp(new MouseEvent('mouseup'));
  expect(finishEditorSelectionModifierGesture(canvas, gesture)).toBe(false);
  expect(canvas.getActiveObjects()).toEqual([first]);
  expect(canvas.exitSelectionGroup()).toBe(true);
  expect(canvas.getActiveObject()).toBe(group);
});

it('enters a prepared group without enabling native group flags', () => {
  const { canvas, first, group, history, sync } = createNestedSelectionCanvas();
  prepareEditorObject(group, { onTextboxExitEmpty: vi.fn(), onTextboxExitCommit: vi.fn() });
  canvas.setActiveObject(group);
  const point = first.getCenterPoint();
  handleEditorDoubleClick({
    canvas,
    target: group,
    event: new MouseEvent('dblclick', {
      clientX: point.x,
      clientY: point.y,
    }),
    activeTool: 'select',
    commitHistory: history,
    syncRuntimeState: sync,
  });
  expect(canvas.getActiveObject()).toBe(first);
  expect(first.evented).toBe(true);
  expect(group.interactive).toBe(false);
  expect(group.subTargetCheck).toBe(false);
});

it('leaves nested groups one level at a time and gives a native child drag priority over group exit', () => {
  const { canvas, first, group, sync } = createNestedSelectionCanvas();
  canvas.remove(group);
  const outer = new Group([group]);
  outer.sniptaleType = 'group';
  outer.sniptaleId = 'outer';
  canvas.add(outer);
  const point = first.getCenterPoint();
  const event = new MouseEvent('dblclick', { clientX: point.x, clientY: point.y });
  canvas.enterSelectionGroup(outer, event);
  expect(canvas.getActiveObject()).toBe(group);
  canvas.enterSelectionGroup(group, event);
  expect(canvas.getActiveObject()).toBe(first);
  canvas.__onMouseDown(new MouseEvent('mousedown', { clientX: point.x, clientY: point.y }));
  canvas.__onMouseMove(
    new MouseEvent('mousemove', { clientX: point.x + 16, clientY: point.y + 8, buttons: 1 })
  );
  expect(first.getCenterPoint().x).toBeCloseTo(point.x + 16, 5);
  expect(first.getCenterPoint().y).toBeCloseTo(point.y + 8, 5);
  cancelEditorTransientInteraction({
    canvas,
    drawSession: null,
    cropGuide: null,
    activeTool: 'select',
    clearCropSelection: vi.fn(),
    switchToSelectTool: vi.fn(),
    syncRuntimeState: sync,
  });
  expect(canvas.getSelectionGroupScope()).toBe(group);
  expect(canvas.getActiveObject()).toBe(first);
  expect(canvas.exitSelectionGroup()).toBe(true);
  expect(canvas.getActiveObject()).toBe(group);
  expect(canvas.getSelectionGroupScope()).toBe(outer);
  expect(canvas.exitSelectionGroup()).toBe(true);
  expect(canvas.getActiveObject()).toBe(outer);
  expect(canvas.getSelectionGroupScope()).toBeNull();
});

it('cancels nested text editing before leaving its group through the existing keyboard owner', () => {
  const { canvas, group, sync } = createNestedSelectionCanvas();
  const text = createEditorDrawingFabricObject(
    {
      kind: 'text',
      id: 'nested-label',
      bounds: { x: 20, y: 130, width: 140, height: 34 },
      fontSize: 24,
      color: '#000000',
      backgroundColor: null,
      text: 'Source text',
    },
    1
  ) as Textbox;
  group.add(text);
  const commit = vi.fn();
  prepareEditorObject(group, { onTextboxExitEmpty: vi.fn(), onTextboxExitCommit: commit });
  canvas.enterSelectionGroup(group);
  const original = text.getCenterPoint();
  handleEditorDoubleClick({
    canvas,
    target: text,
    event: new MouseEvent('dblclick'),
    activeTool: 'select',
    commitHistory: commit,
    syncRuntimeState: sync,
  });
  expect(text.isEditing).toBe(true);
  text.set('text', 'Changed text');
  text.fire('changed');
  const cancelTransientInteraction = vi.fn(() => canvas.exitSelectionGroup());
  const options = {
    canvas,
    key: 'Escape',
    code: 'Escape',
    activeTool: 'select',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    hasCropGuide: false,
    isComposing: false,
    cancelTransientInteraction,
    undo: vi.fn(),
    redo: vi.fn(),
    duplicateSelection: vi.fn(),
    deleteSelection: vi.fn(),
    applyCropSelection: vi.fn(),
    syncRuntimeState: sync,
  };
  expect(
    handleEditorWindowKeyDown({ ...options, target: text.hiddenTextarea }).preventDefault
  ).toBe(true);
  expect(text.text).toBe('Source text');
  expect(text.isEditing).toBe(false);
  expect(text.getCenterPoint().distanceFrom(original)).toBeLessThan(0.001);
  expect(canvas.getSelectionGroupScope()).toBe(group);
  expect(cancelTransientInteraction).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
  handleEditorWindowKeyDown({ ...options, target: canvas.upperCanvasEl });
  expect(canvas.getActiveObject()).toBe(group);
  expect(cancelTransientInteraction).toHaveBeenCalledOnce();
});

it('does not accept a partially covered scoped child through marquee', () => {
  const { canvas, first, group } = createNestedSelectionCanvas();
  canvas.enterSelectionGroup(group);
  const bounds = first.getBoundingRect();
  canvas.__onMouseDown(
    new MouseEvent('mousedown', { clientX: bounds.left - 2, clientY: bounds.top - 2 })
  );
  const end = { clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2 };
  canvas.__onMouseMove(new MouseEvent('mousemove', { ...end, buttons: 1 }));
  expect(canvas.getSelectionPreviewObjects()).toEqual([]);
  canvas.__onMouseUp(new MouseEvent('mouseup', end));
  expect(canvas.getActiveObjects()).toEqual([]);
});
