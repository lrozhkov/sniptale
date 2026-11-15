import { ActiveSelection, Group, type Canvas, type FabricObject } from 'fabric';
import type { EditorControllerPublicApiAdapter } from '../public-api/types';
import { synchronizeEditorDrawingObjectFromFabric } from '../../drawing/object/metadata';

const GROUPABLE_TYPES = new Set([
  'pencil',
  'marker',
  'shape',
  'vector-element',
  'simplify',
  'blur',
  'arrow',
  'text',
  'image',
  'step',
  'group',
]);

type GroupLayerController = Pick<
  EditorControllerPublicApiAdapter,
  'canvas' | 'commitHistory' | 'prepareObject' | 'syncRuntimeState'
>;

function isGroupableLayer(object: FabricObject): boolean {
  let ancestor = object.parent;
  while (ancestor) {
    if (ancestor.sniptaleLocked || ancestor.visible === false) return false;
    ancestor = ancestor.parent;
  }
  return (
    Boolean(object.sniptaleId) &&
    !object.sniptaleLocked &&
    GROUPABLE_TYPES.has(object.sniptaleType ?? '')
  );
}

function commitGroupChange(controller: GroupLayerController, canvas: Canvas): void {
  canvas.requestRenderAll();
  controller.commitHistory();
  controller.syncRuntimeState();
}

export function groupSelectedEditorLayers(controller: GroupLayerController): boolean {
  const canvas = controller.canvas;
  if (!canvas) return false;
  const selected = new Set(canvas.getActiveObjects());
  const parent = [...selected][0]?.parent;
  const collection = parent ?? canvas;
  const objects = collection.getObjects();
  const members = objects.filter((object) => selected.has(object));
  if (members.length !== selected.size || members.length < 2 || !members.every(isGroupableLayer))
    return false;

  const insertionIndex = Math.max(...members.map((object) => objects.indexOf(object)));
  canvas.discardActiveObject();
  members.forEach((object) => collection.remove(object));
  const group = new Group(members);
  group.sniptaleId = crypto.randomUUID();
  group.sniptaleType = 'group';
  group.sniptaleRole = 'annotation';
  controller.prepareObject(group);
  collection.insertAt(Math.max(0, insertionIndex - members.length + 1), group);
  canvas.setActiveObject(group);
  commitGroupChange(controller, canvas);
  return true;
}

export function ungroupSelectedEditorLayers(controller: GroupLayerController): boolean {
  const canvas = controller.canvas;
  const active = canvas?.getActiveObject();
  if (!canvas || !(active instanceof Group) || active.sniptaleType !== 'group') return false;
  if (!isGroupableLayer(active)) return false;

  const collection = active.parent ?? canvas;
  const index = collection.getObjects().indexOf(active);
  if (index < 0) return false;
  canvas.discardActiveObject();
  collection.remove(active);
  const members = active.removeAll();
  members.forEach((object, offset) => {
    object.visible = active.visible !== false && object.visible !== false;
    object.opacity *= active.opacity;
    synchronizeEditorDrawingObjectFromFabric(object);
    controller.prepareObject(object);
    collection.insertAt(index + offset, object);
  });
  if (members.length === 1 && members[0]) canvas.setActiveObject(members[0]);
  else if (members.length > 1) canvas.setActiveObject(new ActiveSelection(members, { canvas }));
  commitGroupChange(controller, canvas);
  return true;
}
