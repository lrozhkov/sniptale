// @vitest-environment jsdom

import { ActiveSelection, FabricImage, Group, Rect } from 'fabric';
import { afterEach, expect, it, vi } from 'vitest';
import {
  beginEditorSelectionModifierGesture,
  finishEditorSelectionModifierGesture,
  finishEditorSelectionModifierMouseDown,
} from '../../controller/events/selection-modifiers';
import { prepareEditorObject } from '../../controller/document/objects/prepare';
import { createEditorDrawingFabricObject } from '../../drawing/object/vector';
import { EditorCanvas } from './render-region';

const nestedSelectionCanvases: EditorCanvas[] = [];
afterEach(async () => {
  await Promise.all(nestedSelectionCanvases.splice(0).map((canvas) => canvas.dispose()));
});

function createOverlapSelectionCanvas() {
  const canvas = new EditorCanvas(document.createElement('canvas'), {
    width: 800,
    height: 600,
    preserveObjectStacking: true,
    selectionFullyContained: true,
  });
  nestedSelectionCanvases.push(canvas);
  canvas.upperCanvasEl.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect;
  const rect = (left: number, top: number, width: number, height: number) => {
    const object = new Rect({
      left,
      top,
      width,
      height,
      originX: 'left',
      originY: 'top',
      fill: '#111111',
      strokeWidth: 0,
    });
    object.sniptaleType = 'shape';
    return object;
  };
  const eventAt = (x: number, y: number, type = 'mousemove') => {
    const [a, b, c, d, e, f] = canvas.viewportTransform;
    return new MouseEvent(type, { clientX: a * x + c * y + e, clientY: b * x + d * y + f });
  };
  return { canvas, rect, eventAt };
}

it('hovers and clicks a smaller lower layer through an opaque raster while retaining the raster elsewhere', () => {
  const { canvas, rect, eventAt } = createOverlapSelectionCanvas();
  const lower = rect(90, 90, 30, 30);
  const element = document.createElement('canvas');
  element.width = element.height = 200;
  const context = element.getContext('2d')!;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 200, 200);
  const upper = new FabricImage(element, { left: 20, top: 20, originX: 'left', originY: 'top' });
  upper.sniptaleType = 'image';
  canvas.add(lower, upper);
  expect(canvas.findTarget(eventAt(105, 105))).toMatchObject({
    target: lower,
    container: lower,
    currentTarget: lower,
  });
  expect(canvas.findTarget(eventAt(40, 40)).target).toBe(upper);
  canvas.__onMouseDown(eventAt(105, 105, 'mousedown'));
  canvas.__onMouseUp(eventAt(105, 105, 'mouseup'));
  expect(canvas.getActiveObject()).toBe(lower);
});

it('keeps equal and non-nested overlapping bounds in z-order', () => {
  const { canvas, rect, eventAt } = createOverlapSelectionCanvas();
  const lower = rect(80, 80, 80, 80);
  const equal = rect(80, 80, 80, 80);
  canvas.add(lower, equal);
  expect(canvas.findTarget(eventAt(110, 110)).target).toBe(equal);
  equal.set({ left: 130, top: 80, width: 100, height: 100 });
  equal.setCoords();
  expect(canvas.findTarget(eventAt(140, 110)).target).toBe(equal);
});

it('excludes all containing hits before choosing the topmost remaining sibling', () => {
  const { canvas, rect, eventAt } = createOverlapSelectionCanvas();
  const lower = rect(180, 80, 80, 80);
  const middle = rect(200, 40, 200, 200);
  const upper = rect(0, 0, 300, 300);
  canvas.add(lower, middle, upper);
  expect(canvas.findTarget(eventAt(240, 110)).target).toBe(middle);
});

it('compares transformed corners at zoom and rejects only the hits that contain lower layers', () => {
  const { canvas, rect, eventAt } = createOverlapSelectionCanvas();
  const lower = rect(200, 170, 20, 20);
  const upper = rect(200, 170, 180, 120);
  upper.set({
    originX: 'center',
    originY: 'center',
    angle: 37,
    scaleX: 1.4,
    scaleY: 0.8,
    skewX: 12,
    flipX: true,
  });
  lower.set({ originX: 'center', originY: 'center', angle: 37 });
  canvas.add(lower, upper);
  canvas.setViewportTransform([1.7, 0, 0, 1.7, 23, 17]);
  expect(canvas.findTarget(eventAt(200, 170)).target).toBe(lower);
});

it.each(['visible', 'evented', 'selectable', 'sniptaleLocked'] as const)(
  'does not let an ineligible lower hit with changed %s suppress an upper layer',
  (property) => {
    const { canvas, rect, eventAt } = createOverlapSelectionCanvas();
    const lower = rect(90, 90, 30, 30);
    const upper = rect(20, 20, 200, 200);
    lower.set(property, property === 'sniptaleLocked');
    canvas.add(lower, upper);
    expect(canvas.findTarget(eventAt(105, 105)).target).toBe(upper);
  }
);

it('applies nested priority inside an entered group while preserving active controls and layer priority', () => {
  const { canvas, rect, eventAt } = createOverlapSelectionCanvas();
  const lower = rect(90, 90, 30, 30);
  const upper = rect(20, 20, 200, 200);
  const group = new Group([lower, upper]);
  group.sniptaleType = 'group';
  canvas.add(group);
  const point = lower.getCenterPoint();
  expect(canvas.findTarget(eventAt(point.x, point.y)).target).toBe(group);
  expect(canvas.enterSelectionGroup(group)).toBe(true);
  expect(canvas.findTarget(eventAt(point.x, point.y))).toMatchObject({
    target: lower,
    container: lower,
    currentTarget: lower,
  });
  canvas.setActiveObject(upper);
  canvas.setLayerSelectionPriority(upper);
  expect(canvas.findTarget(eventAt(point.x, point.y)).target).toBe(upper);
  canvas.setLayerSelectionPriority(null);
  const control = upper.oCoords['tl']!;
  expect(canvas.findTarget(eventAt(control.x, control.y)).target).toBe(upper);
});

it.each(['selection', 'isDrawingMode'] as const)(
  'keeps native stack targeting when %s disables ordinary layer selection',
  (property) => {
    const { canvas, rect, eventAt } = createOverlapSelectionCanvas();
    const lower = rect(90, 90, 30, 30);
    const upper = rect(20, 20, 200, 200);
    canvas.add(lower, upper);
    canvas[property] = property === 'isDrawingMode';
    expect(canvas.findTarget(eventAt(105, 105)).target).toBe(upper);
  }
);

it.each(['shiftKey', 'ctrlKey'] as const)(
  'preserves %s composition when the nested lower target is beneath a raster',
  (key) => {
    const { canvas, rect } = createOverlapSelectionCanvas();
    const inside = rect(90, 90, 30, 30);
    const partial = rect(270, 190, 30, 30);
    const element = document.createElement('canvas');
    element.width = element.height = 200;
    const image = new FabricImage(element, {
      left: 20,
      top: 20,
      originX: 'left',
      originY: 'top',
    });
    image.sniptaleType = 'image';
    canvas.add(inside, partial, image);
    canvas.selectionKey = 'ctrlKey';
    let modifier: ReturnType<typeof beginEditorSelectionModifierGesture> = null;
    canvas.on('mouse:down:before', ({ e, target }) => {
      modifier = beginEditorSelectionModifierGesture({
        activeTool: 'select',
        canvas,
        event: e,
        ...(target ? { target } : {}),
      });
    });
    canvas.on('mouse:down', () => {
      modifier = finishEditorSelectionModifierMouseDown(canvas, modifier);
    });
    canvas.on('mouse:up', () => {
      finishEditorSelectionModifierGesture(canvas, modifier);
      modifier = null;
    });
    canvas.setActiveObject(partial);
    canvas.__onMouseDown(new MouseEvent('mousedown', { clientX: 110, clientY: 110, [key]: true }));
    canvas.__onMouseUp(new MouseEvent('mouseup', { clientX: 110, clientY: 110, [key]: true }));
    expect(new Set(canvas.getActiveObjects())).toEqual(new Set([partial, inside]));
  }
);

it('preserves the native ActiveSelection aggregate over a nested lower target', () => {
  const { canvas, rect, eventAt } = createOverlapSelectionCanvas();
  const lower = rect(90, 90, 30, 30);
  const other = rect(270, 190, 30, 30);
  const upper = rect(20, 20, 200, 200);
  canvas.add(lower, other, upper);
  const active = new ActiveSelection([lower, other], { canvas });
  canvas.setActiveObject(active);
  expect(canvas.findTarget(eventAt(105, 105)).target).toBe(active);
});

it('retains native arrow pixel targeting rather than changing its individual bounds hit', () => {
  const { canvas, eventAt } = createOverlapSelectionCanvas();
  canvas.targetFindTolerance = 5;
  const arrow = createEditorDrawingFabricObject(
    {
      kind: 'arrow',
      id: 'native-arrow-hit',
      color: '#111111',
      dynamicWidth: false,
      start: { x: 40, y: 40 },
      end: { x: 180, y: 160 },
      width: 12,
    },
    1
  );
  prepareEditorObject(arrow, { onTextboxExitEmpty: vi.fn(), onTextboxExitCommit: vi.fn() });
  canvas.add(arrow);
  expect(arrow.perPixelTargetFind).toBe(true);
  expect(canvas.findTarget(eventAt(110, 100)).target).toBe(arrow);
  expect(canvas.findTarget(eventAt(50, 150)).target).toBeUndefined();
});
