// @vitest-environment jsdom

import {
  ActiveSelection,
  Ellipse,
  FabricImage,
  Group,
  Path,
  Rect,
  Textbox,
  type FabricObject,
} from 'fabric';
import {
  beginEditorSelectionModifierGesture,
  finishEditorSelectionModifierGesture,
  finishEditorSelectionModifierMouseDown,
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
import type { EditorObjectType } from '../../../features/editor/document/types';
import { selectEditorLayerById } from '../../controller/public-actions/selection/layers/select';

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

function createRasterSelectionCanvas() {
  const element = document.createElement('canvas');
  element.width = element.height = 300;
  const image = new FabricImage(element, { left: 40, top: 40, width: 300, height: 300 });
  image.sniptaleId = 'raster';
  image.sniptaleType = 'image';
  const inside = new Rect({ left: 110, top: 110, width: 25, height: 25 });
  inside.sniptaleId = 'inside';
  inside.sniptaleType = 'shape';
  const partial = new Rect({ left: 180, top: 160, width: 40, height: 40 });
  partial.sniptaleId = 'partial';
  partial.sniptaleType = 'shape';
  const canvas = new EditorCanvas(document.createElement('canvas'), {
    width: 800,
    height: 600,
    preserveObjectStacking: true,
    selectionFullyContained: true,
  });
  canvas.add(image, inside, partial);
  nestedSelectionCanvases.push(canvas);
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
  return { canvas, image, inside, partial };
}

it('selects an image on first click and only moves it on a subsequent drag', () => {
  const { canvas, image } = createRasterSelectionCanvas();
  canvas.__onMouseDown(new MouseEvent('mousedown', { clientX: 70, clientY: 70 }));
  expect(canvas.getActiveObject()).toBeUndefined();
  canvas.__onMouseUp(new MouseEvent('mouseup', { clientX: 70, clientY: 70 }));
  expect(canvas.getActiveObject()).toBe(image);
  canvas.__onMouseDown(new MouseEvent('mousedown', { clientX: 70, clientY: 70 }));
  canvas.__onMouseMove(new MouseEvent('mousemove', { clientX: 90, clientY: 80, buttons: 1 }));
  canvas.__onMouseUp(new MouseEvent('mouseup', { clientX: 90, clientY: 80 }));
  expect(image.left).toBe(60);
  expect(image.top).toBe(50);
});

it('starts a fully-contained marquee over an unselected image without moving it', () => {
  const { canvas, image, inside } = createRasterSelectionCanvas();
  canvas.__onMouseDown(new MouseEvent('mousedown', { clientX: 70, clientY: 70 }));
  canvas.__onMouseMove(new MouseEvent('mousemove', { clientX: 195, clientY: 185, buttons: 1 }));
  expect(canvas.getSelectionPreviewObjects()).toEqual([inside]);
  canvas.__onMouseUp(new MouseEvent('mouseup', { clientX: 195, clientY: 185 }));
  expect(canvas.getActiveObjects()).toEqual([inside]);
  expect({ left: image.left, top: image.top }).toEqual({ left: 40, top: 40 });
});

it.each(['shiftKey', 'ctrlKey'] as const)(
  'preserves %s marquee composition when it starts over an unselected image',
  (key) => {
    const { canvas, inside, partial } = createRasterSelectionCanvas();
    canvas.setActiveObject(partial);
    canvas.__onMouseDown(new MouseEvent('mousedown', { clientX: 70, clientY: 70, [key]: true }));
    canvas.__onMouseMove(
      new MouseEvent('mousemove', {
        clientX: 150,
        clientY: 150,
        buttons: 1,
        [key]: true,
      })
    );
    canvas.__onMouseUp(new MouseEvent('mouseup', { clientX: 150, clientY: 150, [key]: true }));
    expect(new Set(canvas.getActiveObjects())).toEqual(new Set([partial, inside]));
  }
);

it.each(['shiftKey', 'ctrlKey'] as const)(
  'preserves %s click composition on an unselected image',
  (key) => {
    const { canvas, image, partial } = createRasterSelectionCanvas();
    canvas.setActiveObject(partial);
    canvas.__onMouseDown(new MouseEvent('mousedown', { clientX: 70, clientY: 70, [key]: true }));
    canvas.__onMouseUp(new MouseEvent('mouseup', { clientX: 70, clientY: 70, [key]: true }));
    expect(new Set(canvas.getActiveObjects())).toEqual(new Set([partial, image]));
  }
);

it.each([0.25, 1, 4])('keeps click tolerance in CSS pixels at zoom %s', (zoom) => {
  const { canvas, image } = createRasterSelectionCanvas();
  canvas.setZoom(zoom);
  const start = 70 * zoom;
  canvas.__onMouseDown(new MouseEvent('mousedown', { clientX: start, clientY: start }));
  canvas.__onMouseMove(
    new MouseEvent('mousemove', {
      clientX: start + 2,
      clientY: start,
      buttons: 1,
    })
  );
  canvas.__onMouseUp(new MouseEvent('mouseup', { clientX: start + 2, clientY: start }));
  expect(canvas.getActiveObjects()).toEqual([image]);
});

it('cancels a pending image selection with the native marquee and restores the prior selection', () => {
  const { canvas, image, partial } = createRasterSelectionCanvas();
  canvas.setActiveObject(partial);
  canvas.__onMouseDown(new MouseEvent('mousedown', { clientX: 70, clientY: 70 }));
  expect(canvas.cancelSelectionMarquee()).toBe(true);
  canvas.__onMouseUp(new MouseEvent('mouseup', { clientX: 70, clientY: 70 }));
  expect(canvas.getActiveObjects()).toEqual([partial]);
  expect(canvas.getActiveObjects()).not.toContain(image);
});

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

const deferredSelectionTargets: Array<{
  name: string;
  type: EditorObjectType;
  make(): FabricObject;
  point: { x: number; y: number };
}> = [
  {
    name: 'shape',
    type: 'shape',
    make: () => new Rect({ left: 40, top: 40, width: 180, height: 120 }),
    point: { x: 70, y: 70 },
  },
  {
    name: 'ellipse',
    type: 'shape',
    make: () => new Ellipse({ left: 40, top: 40, rx: 100, ry: 80 }),
    point: { x: 140, y: 120 },
  },
  {
    name: 'text',
    type: 'text',
    make: () => new Textbox('Выбор текста', { left: 40, top: 40, width: 250, fontSize: 32 }),
    point: { x: 60, y: 60 },
  },
  {
    name: 'pencil',
    type: 'pencil',
    make: () => new Path('M 40 40 L 220 220', { stroke: '#000', strokeWidth: 20, fill: '' }),
    point: { x: 100, y: 100 },
  },
  {
    name: 'arrow',
    type: 'arrow',
    make: () =>
      new Path('M 40 40 L 220 40 L 200 20 M 220 40 L 200 60', {
        stroke: '#000',
        strokeWidth: 14,
        fill: '',
      }),
    point: { x: 100, y: 40 },
  },
  {
    name: 'blur',
    type: 'blur',
    make: () => new Rect({ left: 40, top: 40, width: 180, height: 120 }),
    point: { x: 70, y: 70 },
  },
  {
    name: 'simplify',
    type: 'simplify',
    make: () => new Rect({ left: 40, top: 40, width: 180, height: 120 }),
    point: { x: 70, y: 70 },
  },
  {
    name: 'vector-element',
    type: 'vector-element',
    make: () => new Group([new Rect({ width: 180, height: 120 })], { left: 40, top: 40 }),
    point: { x: 70, y: 70 },
  },
  {
    name: 'group',
    type: 'group',
    make: () => new Group([new Rect({ width: 180, height: 120 })], { left: 40, top: 40 }),
    point: { x: 70, y: 70 },
  },
];
it.each(deferredSelectionTargets)(
  'defers unselected $name to click or containment marquee before moving',
  ({ name, type, make, point }) => {
    const canvas = new EditorCanvas(document.createElement('canvas'), {
      width: 600,
      height: 400,
      preserveObjectStacking: true,
      selectionFullyContained: true,
    });
    nestedSelectionCanvases.push(canvas);
    const target = make();
    target.set({ originX: 'left', originY: 'top', left: 40, top: 40 });
    target.sniptaleId = name;
    target.sniptaleType = type;
    const enclosed = new Rect({ left: point.x + 12, top: point.y + 12, width: 10, height: 10 });
    enclosed.sniptaleId = 'enclosed';
    canvas.add(target, enclosed);
    const before = target.getCenterPoint();
    const down = () => new MouseEvent('mousedown', { clientX: point.x, clientY: point.y });
    expect(canvas.findTarget(down()).target).toBe(target);
    canvas.__onMouseDown(down());
    expect(canvas.getActiveObject()).toBeUndefined();
    canvas.__onMouseMove(
      new MouseEvent('mousemove', { clientX: point.x + 40, clientY: point.y + 40, buttons: 1 })
    );
    expect(canvas.getSelectionPreviewObjects()).toEqual([enclosed]);
    canvas.__onMouseUp(new MouseEvent('mouseup', { clientX: point.x + 40, clientY: point.y + 40 }));
    expect(canvas.getActiveObjects()).toEqual([enclosed]);
    expect(target.getCenterPoint()).toEqual(before);
    canvas.discardActiveObject();
    canvas.__onMouseDown(down());
    canvas.__onMouseUp(new MouseEvent('mouseup', { clientX: point.x, clientY: point.y }));
    expect(canvas.getActiveObject()).toBe(target);
    canvas.__onMouseDown(down());
    canvas.__onMouseMove(
      new MouseEvent('mousemove', { clientX: point.x + 20, clientY: point.y + 10, buttons: 1 })
    );
    canvas.__onMouseUp(new MouseEvent('mouseup', { clientX: point.x + 20, clientY: point.y + 10 }));
    expect(target.getCenterPoint().x).toBeCloseTo(before.x + 20);
    expect(target.getCenterPoint().y).toBeCloseTo(before.y + 10);
    if (target instanceof Textbox) {
      handleEditorDoubleClick({
        canvas,
        target,
        event: new MouseEvent('dblclick'),
        activeTool: 'select',
        commitHistory: vi.fn(),
        syncRuntimeState: vi.fn(),
      });
      expect(target.isEditing).toBe(true);
      target.exitEditing();
    }
  }
);
it('moves an already selected aggregate without deferring it as a new target', () => {
  const canvas = new EditorCanvas(document.createElement('canvas'), { width: 600, height: 400 });
  nestedSelectionCanvases.push(canvas);
  const a = new Rect({ left: 40, top: 40, width: 70, height: 70 });
  const b = new Rect({ left: 160, top: 40, width: 70, height: 70 });
  canvas.add(a, b);
  const aggregate = new ActiveSelection([a, b], { canvas });
  canvas.setActiveObject(aggregate);
  const before = [a.getCenterPoint(), b.getCenterPoint()];
  canvas.__onMouseDown(new MouseEvent('mousedown', { clientX: 70, clientY: 70 }));
  canvas.__onMouseMove(new MouseEvent('mousemove', { clientX: 90, clientY: 80, buttons: 1 }));
  canvas.__onMouseUp(new MouseEvent('mouseup', { clientX: 90, clientY: 80 }));
  expect(canvas.getActiveObject()).toBe(aggregate);
  [a, b].forEach((object, index) => {
    expect(object.getCenterPoint().x).toBeCloseTo(before[index]!.x + 20);
    expect(object.getCenterPoint().y).toBeCloseTo(before[index]!.y + 10);
  });
});
