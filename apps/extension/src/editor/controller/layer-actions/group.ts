import { ActiveSelection, Group, type Canvas, type FabricObject } from 'fabric';
import type { EditorControllerPublicApiAdapter } from '../public-api/types';
import { synchronizeEditorDrawingObjectFromFabric } from '../../drawing/object/metadata';

const GROUPABLE_TYPES = new Set([
  'pencil',
  'marker',
  'shape',
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
  const objects = canvas.getObjects();
  const members = objects.filter((object) => selected.has(object));
  if (members.length < 2 || !members.every(isGroupableLayer)) return false;

  const insertionIndex = Math.max(...members.map((object) => objects.indexOf(object)));
  canvas.discardActiveObject();
  members.forEach((object) => canvas.remove(object));
  const group = new Group(members);
  group.sniptaleId = crypto.randomUUID();
  group.sniptaleType = 'group';
  group.sniptaleRole = 'annotation';
  controller.prepareObject(group);
  canvas.insertAt(Math.max(0, insertionIndex - members.length + 1), group);
  canvas.setActiveObject(group);
  commitGroupChange(controller, canvas);
  return true;
}

export function ungroupSelectedEditorLayers(controller: GroupLayerController): boolean {
  const canvas = controller.canvas;
  const active = canvas?.getActiveObject();
  if (!canvas || !(active instanceof Group) || active.sniptaleType !== 'group') return false;
  if (active.sniptaleLocked) return false;

  const index = canvas.getObjects().indexOf(active);
  if (index < 0) return false;
  canvas.discardActiveObject();
  canvas.remove(active);
  const members = active.removeAll();
  members.forEach((object, offset) => {
    object.visible = active.visible !== false && object.visible !== false;
    object.opacity *= active.opacity;
    synchronizeEditorDrawingObjectFromFabric(object);
    controller.prepareObject(object);
    canvas.insertAt(index + offset, object);
  });
  if (members.length === 1 && members[0]) canvas.setActiveObject(members[0]);
  else if (members.length > 1) canvas.setActiveObject(new ActiveSelection(members, { canvas }));
  commitGroupChange(controller, canvas);
  return true;
}
