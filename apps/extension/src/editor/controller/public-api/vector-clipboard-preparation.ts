import { FabricImage, FabricObject, Group, Pattern, util } from 'fabric';
import type { EditorVectorDefinition } from '../../../features/editor/document/vector-element';
import { isEditorVectorInstance } from '../../../features/editor/document/vector-element';
import { EDITOR_RASTER_BINARY_FIELDS } from '../../../features/editor/document/raster-state';
import type { AssetRef } from '../../../composition/persistence/assets/contracts';
import { CUSTOM_JSON_PROPS } from '../../document/model/custom-json-props';
import { isBackgroundObject, isSourceObject } from '../../document/model';
import {
  readEditorDrawingObject,
  translateEditorDrawingObject,
  writeEditorDrawingObject,
} from '../../drawing/object/metadata';
import {
  commitFrameAnnotationProxy,
  readFrameAnnotationSnapshot,
} from '../../frame-annotation/proxy';
import { refreshEditorCloneIdentities } from '../public-actions/selection/objects/duplicate';
import { bindClonedVectorResources } from '../public-actions/selection/objects/vector-resources';
import type { EditorVectorPublisher } from './vector-elements';

function hasVectorInstance(object: FabricObject): boolean {
  if (object.sniptaleType === 'vector-element')
    return isEditorVectorInstance(object.sniptaleVectorElement);
  return object instanceof Group && object.getObjects().some(hasVectorInstance);
}

function isRuntimeFabricObject(value: unknown): value is FabricObject {
  return value instanceof FabricObject;
}

function hasClosedVectorResources(object: FabricObject): boolean {
  if (
    object instanceof FabricImage ||
    object.fill instanceof Pattern ||
    object.stroke instanceof Pattern ||
    isSourceObject(object) ||
    isBackgroundObject(object) ||
    object.sniptaleType === 'simplify'
  )
    return false;
  const fields = [
    ...EDITOR_RASTER_BINARY_FIELDS,
    'sniptaleBackgroundImageData',
    'sniptaleSimplifySourceData',
    'sniptaleBlurSourceData',
  ] as const;
  if (
    fields.some((field) => {
      const value = object[field];
      return typeof value === 'string' && value.length > 0;
    })
  )
    return false;
  const clipPath: unknown = object.clipPath;
  if (clipPath && (!isRuntimeFabricObject(clipPath) || !hasClosedVectorResources(clipPath)))
    return false;
  return !(object instanceof Group) || object.getObjects().every(hasClosedVectorResources);
}

/** A copyable vector closure cannot depend on mutable raster resources. */
export function canCopyVectorObjects(objects: readonly FabricObject[]): boolean {
  return (
    objects.length > 0 && objects.every(hasClosedVectorResources) && objects.some(hasVectorInstance)
  );
}

/** Detach the selected world geometry; the caller owns the returned clones. */
export async function cloneVectorClipboardSelection(
  selection: readonly FabricObject[]
): Promise<FabricObject[]> {
  const objects: FabricObject[] = [];
  try {
    for (const original of selection) {
      const clone = await original.clone([...CUSTOM_JSON_PROPS]);
      objects.push(clone);
      if (original.group || original.parent)
        util.applyTransformToObject(clone, original.calcTransformMatrix());
    }
    return objects;
  } catch (error) {
    objects.forEach((object) => object.dispose());
    throw error;
  }
}

export interface PreparedVectorPaste {
  objects: FabricObject[];
  refs: ReadonlyMap<string, AssetRef>;
}

function positionPasteObjects(
  objects: FabricObject[],
  point: { x: number; y: number },
  prepareObject: (object: FabricObject) => void
): void {
  const bounds = objects.map((object) => object.getBoundingRect());
  const left = Math.min(...bounds.map((rect) => rect.left));
  const right = Math.max(...bounds.map((rect) => rect.left + rect.width));
  const top = Math.min(...bounds.map((rect) => rect.top));
  const bottom = Math.max(...bounds.map((rect) => rect.top + rect.height));
  const delta = { x: point.x - (left + right) / 2, y: point.y - (top + bottom) / 2 };
  for (const clone of objects) {
    clone.set({ left: clone.left + delta.x, top: clone.top + delta.y });
    refreshEditorCloneIdentities(clone);
    const drawing = readEditorDrawingObject(clone);
    if (drawing)
      writeEditorDrawingObject(
        clone,
        translateEditorDrawingObject(drawing, delta, clone.sniptaleId)
      );
    const frame = readFrameAnnotationSnapshot(clone);
    if (frame)
      commitFrameAnnotationProxy(clone, { ...frame, x: frame.x + delta.x, y: frame.y + delta.y });
    prepareObject(clone);
    clone.setCoords();
  }
}

/** Prepare one detached paste. Ownership transfers only when the complete result returns. */
export async function prepareVectorPaste(options: {
  objects: readonly FabricObject[];
  definitions: Record<string, EditorVectorDefinition>;
  publisher: EditorVectorPublisher;
  current(): boolean;
  position(): { x: number; y: number };
  prepareObject(object: FabricObject): void;
}): Promise<PreparedVectorPaste | null> {
  const objects: FabricObject[] = [];
  let transferred = false;
  try {
    for (const object of options.objects) {
      objects.push(await object.clone([...CUSTOM_JSON_PROPS]));
      if (!options.current()) return null;
    }
    await bindClonedVectorResources(objects, options.definitions);
    if (!options.current()) return null;
    const refs = new Map<string, AssetRef>();
    for (const definition of Object.values(options.definitions)) {
      refs.set(definition.id, await options.publisher.publish(definition));
      if (!options.current()) return null;
    }
    positionPasteObjects(objects, options.position(), options.prepareObject);
    transferred = true;
    return { objects, refs };
  } finally {
    if (!transferred) objects.forEach((object) => object.dispose());
  }
}
