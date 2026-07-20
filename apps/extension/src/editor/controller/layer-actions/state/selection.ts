import { ActiveSelection, type Canvas, type FabricObject } from 'fabric';

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
  const target = canvas.getObjects().find((object) => object.sniptaleId === id);
  return target && isEditableObject(target) ? target : null;
}

function getOrderedSelectedObjects(canvas: Canvas, ids: Iterable<string>): FabricObject[] {
  const selectedIds = new Set(ids);
  return canvas
    .getObjects()
    .filter(
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
  const layers = canvas
    .getObjects()
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

  const recovered = ensureObjectReachable(target);
  const currentSelectedIds = getCurrentEditableSelectionIds(canvas);
  let nextSelection: FabricObject[] = [target];

  if (options.range && options.anchorId) {
    nextSelection = buildRangeSelection(canvas, options.anchorId, id);
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
