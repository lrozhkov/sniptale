import { FabricObject, Path, type Canvas, type SerializedObjectProps } from 'fabric';
import { emptyCanvasJson } from '../core/helpers';
import { CUSTOM_JSON_PROPS, isSourceObject, isUserObject } from '../../document/model';
import { readEditorDrawingObject } from '../../drawing/object/metadata';
import { isRichShapeObject } from '../../objects/rich-shape/guards';

const EDITOR_DOCUMENT_JSON_PROPS = [
  ...CUSTOM_JSON_PROPS,
  'sniptaleBlurStrokeColor',
  'sniptaleBlurStrokeWidth',
] as const;

export function serializeCanvasObjects(canvas: Canvas | null): string {
  if (!canvas) {
    return emptyCanvasJson();
  }
  return JSON.stringify(collectCanvasObjects(canvas));
}

/** Captures JSON-compatible data without encoding it or retaining live Fabric references. */
export function captureCanvasObjects(canvas: Canvas) {
  const snapshot = structuredClone(collectCanvasObjects(canvas));
  const pending: object[] = [snapshot];
  const visited = new WeakSet<object>();
  while (pending.length) {
    const current = pending.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const [key, entry] of Object.entries(current)) {
      const value: unknown = entry;
      if (value === undefined && !Array.isArray(current)) Reflect.deleteProperty(current, key);
      else if (typeof value === 'object' && value !== null) pending.push(value);
    }
  }
  return snapshot;
}

function collectCanvasObjects(canvas: Canvas) {
  const objects: SerializedObjectProps[] = [];
  for (const object of canvas.getObjects()) {
    const drawing = readEditorDrawingObject(object);
    if (
      !isUserObject(object) ||
      isRichShapeObject(object) ||
      (drawing?.kind === 'simplify' && !drawing.result)
    )
      continue;
    const serialized = serializeEditorCanvasObject(object);
    if (isSourceObject(object)) delete serialized.clipPath;

    objects.push(serialized);
  }
  return { version: '7.2.0', objects };
}

/** Serializes canonical freehand samples without repeating their derived polygon. */
export function serializeEditorCanvasObject(
  object: FabricObject,
  properties: readonly string[] = EDITOR_DOCUMENT_JSON_PROPS
): SerializedObjectProps & { clipPath?: unknown; path?: unknown } {
  const drawing = readEditorDrawingObject(object);
  const compactPath =
    (drawing?.kind === 'pencil' || drawing?.kind === 'marker') && object instanceof Path;
  const serialize = compactPath ? FabricObject.prototype.toObject : object.toObject;
  const serialized = serialize.call(object, [...properties]) as SerializedObjectProps & {
    clipPath?: unknown;
    path?: unknown;
  };
  // The load owner rebuilds top-level paths from samples. Groups retain their full children.
  if (compactPath) serialized.path = [['M', 0, 0]];
  return serialized;
}
