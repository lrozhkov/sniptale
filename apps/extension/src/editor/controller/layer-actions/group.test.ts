// @vitest-environment jsdom
import { createEditorDrawingSimplifyObject } from '../../drawing/object/simplify';
import { readEditorDrawingObject } from '../../drawing/object/metadata';
import { refreshPreparedObjectGeometry } from '../document/objects/geometry-refresh';
import { createDefaultSimplifySettings } from '../../../features/simplify/settings';
import { canGroupLayerSelection } from '../../inspector/layers/helpers';
import { ActiveSelection, Group, Rect, type Canvas, type FabricObject } from 'fabric';
import { expect, it, vi } from 'vitest';
import { groupSelectedEditorLayers, ungroupSelectedEditorLayers } from './group';
import { serializeCanvasObjects } from '../document/serialization';
import { collectLayers } from '../document/layers';
import { duplicateEditorSelection } from '../public-actions/selection/objects/duplicate';

function createHarness() {
  const source = new Rect({ left: 0, top: 0, width: 100, height: 80 });
  source.sniptaleId = 'source';
  source.sniptaleType = 'source-image';
  const first = new Rect({ left: 12, top: 14, width: 20, height: 15 });
  first.sniptaleId = 'first';
  first.sniptaleType = 'shape';
  const second = new Rect({ left: 44, top: 26, width: 18, height: 16 });
  second.sniptaleId = 'second';
  second.sniptaleType = 'shape';
  const objects: FabricObject[] = [source, first, second];
  let active: FabricObject | null = null;
  const canvas = {
    getObjects: () => objects,
    getActiveObjects: () =>
      active instanceof ActiveSelection ? active.getObjects() : active ? [active] : [],
    getActiveObject: () => active,
    discardActiveObject: () => {
      active = null;
    },
    remove: (object: FabricObject) => {
      objects.splice(objects.indexOf(object), 1);
    },
    add: (object: FabricObject) => {
      objects.push(object);
    },
    insertAt: (index: number, object: FabricObject) => {
      objects.splice(index, 0, object);
    },
    setActiveObject: (object: FabricObject) => {
      active = object;
    },
    requestRenderAll: vi.fn(),
    fire: vi.fn(),
  } as unknown as Canvas;
  const controller = {
    canvas,
    commitHistory: vi.fn(),
    prepareObject: vi.fn(),
    syncRuntimeState: vi.fn(),
  };
  return {
    canvas,
    controller,
    first,
    objects,
    second,
    setActive: (object: FabricObject) => {
      active = object;
    },
    source,
  };
}

it('groups vector layers without rasterizing, and ungroups them at the same stack position', () => {
  const harness = createHarness();
  const before = [harness.first.getCenterPoint(), harness.second.getCenterPoint()];
  harness.setActive(new ActiveSelection([harness.first, harness.second]));

  expect(groupSelectedEditorLayers(harness.controller)).toBe(true);
  const group = harness.canvas.getActiveObject();
  expect(group).toBeInstanceOf(Group);
  expect(group?.sniptaleType).toBe('group');
  expect((group as Group).getObjects()).toEqual([harness.first, harness.second]);
  expect(harness.objects).toEqual([harness.source, group]);
  expect(harness.controller.commitHistory).toHaveBeenCalledTimes(1);
  const [groupLayer] = collectLayers(harness.canvas);
  expect(groupLayer).toMatchObject({ type: 'group', groupSize: 2 });
  expect(groupLayer?.groupChildren?.map((child) => child.id)).toEqual(['second', 'first']);

  expect(ungroupSelectedEditorLayers(harness.controller)).toBe(true);
  expect(harness.objects).toEqual([harness.source, harness.first, harness.second]);
  expect(harness.controller.commitHistory).toHaveBeenCalledTimes(2);
  expect(harness.first.getCenterPoint().distanceFrom(before[0]!)).toBeLessThan(0.001);
  expect(harness.second.getCenterPoint().distanceFrom(before[1]!)).toBeLessThan(0.001);
});

it('rejects grouping the source or locked layers without committing history', () => {
  const harness = createHarness();
  harness.setActive(new ActiveSelection([harness.source, harness.first]));
  expect(groupSelectedEditorLayers(harness.controller)).toBe(false);
  harness.first.sniptaleLocked = true;
  harness.setActive(new ActiveSelection([harness.first, harness.second]));
  expect(groupSelectedEditorLayers(harness.controller)).toBe(false);
  expect(harness.controller.commitHistory).not.toHaveBeenCalled();
});

it('retains group and child identities in the persisted canvas tree', async () => {
  const harness = createHarness();
  harness.setActive(new ActiveSelection([harness.first, harness.second]));
  groupSelectedEditorLayers(harness.controller);

  const document = JSON.parse(serializeCanvasObjects(harness.canvas)) as {
    objects: Array<{ objects?: Array<{ sniptaleId?: string }>; sniptaleType?: string }>;
  };
  expect(document.objects[1]?.sniptaleType).toBe('group');
  expect(document.objects[1]?.objects?.map((object) => object.sniptaleId)).toEqual([
    'first',
    'second',
  ]);
  const restored = await Group.fromObject(document.objects[1] as never);
  expect(restored.getObjects().map((object) => object.sniptaleId)).toEqual(['first', 'second']);
});

it('duplicates a group with fresh child identities', async () => {
  const harness = createHarness();
  harness.setActive(new ActiveSelection([harness.first, harness.second]));
  groupSelectedEditorLayers(harness.controller);
  const original = harness.canvas.getActiveObject() as Group;

  await duplicateEditorSelection({
    canvas: harness.canvas,
    prepareObject: harness.controller.prepareObject,
    nextLabelIndex: () => 2,
    commitHistory: harness.controller.commitHistory,
    syncRuntimeState: harness.controller.syncRuntimeState,
  });

  const copy = harness.canvas.getActiveObject() as Group;
  expect(copy).toBeInstanceOf(Group);
  expect(copy.sniptaleId).not.toBe(original.sniptaleId);
  expect(copy.getObjects().map((object) => object.sniptaleId)).not.toEqual(
    original.getObjects().map((object) => object.sniptaleId)
  );
  expect(harness.objects).toHaveLength(3);
});

it('keeps a hidden group hidden after ungrouping', () => {
  const harness = createHarness();
  harness.setActive(new ActiveSelection([harness.first, harness.second]));
  groupSelectedEditorLayers(harness.controller);
  const group = harness.canvas.getActiveObject() as Group;
  group.visible = false;
  group.opacity = 0.5;
  harness.first.opacity = 0.6;

  ungroupSelectedEditorLayers(harness.controller);

  expect(harness.first.visible).toBe(false);
  expect(harness.second.visible).toBe(false);
  expect(harness.first.opacity).toBeCloseTo(0.3);
});

it('preserves child positions after moving and resizing a group', () => {
  const harness = createHarness();
  harness.setActive(new ActiveSelection([harness.first, harness.second]));
  groupSelectedEditorLayers(harness.controller);
  const group = harness.canvas.getActiveObject() as Group;
  group.set({ left: group.left + 30, top: group.top + 12, scaleX: 1.5, scaleY: 0.75 });
  group.setCoords();
  const before = group.getObjects().map((object) => object.getCenterPoint());

  expect(ungroupSelectedEditorLayers(harness.controller)).toBe(true);
  expect(harness.first.getCenterPoint().distanceFrom(before[0]!)).toBeLessThan(0.001);
  expect(harness.second.getCenterPoint().distanceFrom(before[1]!)).toBeLessThan(0.001);
});

it('admits Simplify through the public group flow and preserves editable rasters after transformed ungroup', () => {
  const harness = createHarness();
  const image = document.createElement('canvas');
  image.width = 20;
  image.height = 10;
  const snapshot = { dataUrl: image.toDataURL('image/png'), width: 20, height: 10 };
  const drawing = {
    id: 'simplify-layer',
    kind: 'simplify',
    bounds: { x: 10, y: 10, width: 40, height: 20 },
    settings: createDefaultSimplifySettings(),
    result: snapshot,
    source: { ...snapshot, bounds: { x: 0, y: 0, width: 100, height: 80 } },
  } as const;
  const simplify = createEditorDrawingSimplifyObject(drawing, 1, image);
  harness.objects.splice(1, 1, simplify);
  harness.controller.prepareObject.mockImplementation(refreshPreparedObjectGeometry);
  harness.setActive(new ActiveSelection([simplify, harness.second]));
  expect(canGroupLayerSelection(collectLayers(harness.canvas))).toBe(true);
  expect(groupSelectedEditorLayers(harness.controller)).toBe(true);
  const group = harness.canvas.getActiveObject();
  expect(group).toBeInstanceOf(Group);
  expect(harness.objects).toEqual([harness.source, group]);
  expect(readEditorDrawingObject(simplify)).toMatchObject({
    id: drawing.id,
    result: snapshot,
    source: drawing.source,
  });
  group!.set({ left: group!.left + 25, top: group!.top + 10, scaleX: 1.5, scaleY: 1.5 });
  expect(ungroupSelectedEditorLayers(harness.controller)).toBe(true);
  expect(harness.objects).toEqual([harness.source, simplify, harness.second]);
  expect(readEditorDrawingObject(simplify)).toMatchObject({
    id: drawing.id,
    result: snapshot,
    source: drawing.source,
    sourceDirty: true,
  });
  expect(harness.controller.commitHistory).toHaveBeenCalledTimes(2);
});
