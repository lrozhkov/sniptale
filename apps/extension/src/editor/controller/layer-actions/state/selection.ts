import { EditorCanvas } from '../../../document/canvas-surface/render-region';
import { ActiveSelection, Group, type Canvas, type FabricObject } from 'fabric';

import { isEditableObject } from '../../../document/model';

type SelectLayerObjectOptions = {
  additive?: boolean;
  focusViewport?: boolean;
  range?: boolean;
  toggle?: boolean;
  anchorId?: string | null;
};

function setCanvasSelection(canvas: Canvas, objects: FabricObject[]): void {
  const [singleObject] = objects;
  if (objects.length === 0) {
    canvas.discardActiveObject();
    return;
  }

  canvas.setActiveObject(
    objects.length === 1 && singleObject ? singleObject : new ActiveSelection(objects, { canvas })
  );
}

function getSelectableTarget(canvas: Canvas, id: string): FabricObject | null {
  const find = (objects: FabricObject[]): FabricObject | undefined => {
    for (const object of objects) {
      if (object.sniptaleId === id) return object;
      if (object instanceof Group && object.sniptaleType === 'group') {
        const child = find(object.getObjects());
        if (child) return child;
      }
    }
    return undefined;
  };
  const target = find(canvas.getObjects());
  return target && isEditableObject(target) ? target : null;
}

function getOrderedSelectedObjects(canvas: Canvas, ids: Iterable<string>): FabricObject[] {
  const selectedIds = new Set(ids);
  return (
    canvas instanceof EditorCanvas ? canvas.getSelectionScopeObjects() : canvas.getObjects()
  ).filter(
    (object): object is FabricObject =>
      typeof object.sniptaleId === 'string' &&
      selectedIds.has(object.sniptaleId) &&
      isEditableObject(object)
  );
}

function getCurrentEditableSelectionIds(canvas: Canvas): Set<string> {
  return new Set(
    canvas
      .getActiveObjects()
      .filter(
        (object): object is FabricObject => Boolean(object.sniptaleId) && isEditableObject(object)
      )
      .map((object) => object.sniptaleId as string)
  );
}

function buildRangeSelection(canvas: Canvas, anchorId: string, id: string): FabricObject[] {
  const layers = (
    canvas instanceof EditorCanvas ? canvas.getSelectionScopeObjects() : canvas.getObjects()
  )
    .filter(
      (object): object is FabricObject => Boolean(object.sniptaleId) && isEditableObject(object)
    )
    .slice()
    .reverse();
  const anchorIndex = layers.findIndex((object) => object.sniptaleId === anchorId);
  const targetIndex = layers.findIndex((object) => object.sniptaleId === id);
  if (anchorIndex === -1 || targetIndex === -1) {
    return [];
  }

  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return layers.slice(start, end + 1).reverse();
}

export function selectLayerObject(
  canvas: Canvas | null,
  id: string,
  options: SelectLayerObjectOptions,
  ensureObjectReachable: (object: FabricObject) => boolean,
  focusObjectInViewport: (object: FabricObject) => void
): boolean | null {
  if (!canvas) {
    return null;
  }

  const target = getSelectableTarget(canvas, id);
  if (!target) {
    return null;
  }

  let ancestor = target.parent;
  while (ancestor) {
    if (ancestor.sniptaleLocked || ancestor.visible === false) return null;
    ancestor = ancestor.parent;
  }
  const targetParent = target.parent ?? null;
  if (canvas instanceof EditorCanvas && canvas.getSelectionGroupScope() !== targetParent) {
    if (targetParent) {
      if (!canvas.enterSelectionGroup(targetParent)) return null;
    } else {
      while (canvas.exitSelectionGroup()) {
        /* Leave nested selection before a root row. */
      }
      canvas.discardActiveObject();
    }
  }
  const recovered = ensureObjectReachable(target);
  const currentSelectedIds = getCurrentEditableSelectionIds(canvas);
  let nextSelection: FabricObject[] = [target];

  if (options.range && options.anchorId) {
    const range = buildRangeSelection(canvas, options.anchorId, id);
    nextSelection = range.length ? range : [target];
  } else if (options.additive || options.toggle) {
    if (currentSelectedIds.has(id) && options.toggle) {
      currentSelectedIds.delete(id);
    } else {
      currentSelectedIds.add(id);
    }
    nextSelection = getOrderedSelectedObjects(canvas, currentSelectedIds);
  }

  setCanvasSelection(canvas, nextSelection);
  if (options.focusViewport !== false) {
    focusObjectInViewport(target);
  }
  canvas.requestRenderAll();
  return recovered;
}
