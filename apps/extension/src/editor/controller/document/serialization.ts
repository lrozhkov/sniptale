import { FabricObject, Group, Path, type Canvas, type SerializedObjectProps } from 'fabric';
import { emptyCanvasJson } from '../core/helpers';
import { CUSTOM_JSON_PROPS, isSourceObject, isUserObject } from '../../document/model';
import { readEditorDrawingObject } from '../../drawing/object/metadata';
import { isRichShapeObject } from '../../objects/rich-shape/guards';
import { getEditorVectorAcceptedOpacity } from '../../objects/vector-elements/runtime';

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
  return serializeCanonicalObject(object, properties, true);
}

function serializeCanonicalObject(
  object: FabricObject,
  properties: readonly string[],
  compactDrawing: boolean
): SerializedObjectProps & { clipPath?: unknown; path?: unknown } {
  const vector = object.sniptaleType === 'vector-element';
  const drawing = readEditorDrawingObject(object);
  const compactPath =
    compactDrawing &&
    (drawing?.kind === 'pencil' || drawing?.kind === 'marker') &&
    object instanceof Path;
  const base = vector || object instanceof Group || compactPath;
  const serialized = (base ? FabricObject.prototype.toObject : object.toObject).call(object, [
    ...properties,
    ...(object instanceof Group ? ['subTargetCheck', 'interactive'] : []),
  ]) as SerializedObjectProps & {
    clipPath?: unknown;
    path?: unknown;
    objects?: unknown[];
    layoutManager?: unknown;
  };
  if (vector) {
    if (object instanceof Group) serialized.opacity = getEditorVectorAcceptedOpacity(object);
    delete serialized.clipPath;
    serialized.objects = [];
  } else if (object instanceof Group) {
    const layoutManager = object.layoutManager.toObject();
    if (layoutManager.strategy !== 'fit-content' || object.includeDefaultValues)
      serialized.layoutManager = layoutManager;
    serialized.objects = object
      .getObjects()
      .filter((child) => !child.excludeFromExport)
      .map((child) => {
        const originalDefaults = child.includeDefaultValues;
        child.includeDefaultValues = object.includeDefaultValues;
        try {
          return serializeCanonicalObject(child, properties, false);
        } finally {
          child.includeDefaultValues = originalDefaults;
        }
      });
  }
  // Only top-level canonical drawings are rebuilt by the existing load owner.
  if (compactPath) serialized.path = [['M', 0, 0]];
  return serialized;
}
