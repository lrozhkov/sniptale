import { FabricImage, type Canvas } from 'fabric';
import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { sameHistoryArray } from '@sniptale/foundation/history/equal';
import { getSourceObject } from '../layers';
import { serializeEditorCanvasObject } from '../serialization';

function sameJsonValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right))
    return sameHistoryArray(left, right, sameJsonValue);
  if (!isPlainRecord(left) || !isPlainRecord(right)) return false;
  const keys = Object.keys(left).filter((key) => left[key] !== undefined);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && sameJsonValue(left[key], right[key]))
  );
}

/** Reuses only an exactly unchanged, canvas-owned source during a history transition. */
export async function loadEditorCanvasWithSourceReuse(
  canvas: Canvas,
  canvasJson: string,
  preserveSource: boolean
): Promise<void> {
  const source = preserveSource ? getSourceObject(canvas) : undefined;
  if (!(source instanceof FabricImage) || typeof source.sniptaleId !== 'string') {
    await canvas.loadFromJSON(canvasJson);
    return;
  }
  const serialized: unknown = JSON.parse(canvasJson);
  if (!isPlainRecord(serialized) || !Array.isArray(serialized['objects'])) {
    await canvas.loadFromJSON(canvasJson);
    return;
  }
  const objects: unknown[] = serialized['objects'];
  const matches = objects.flatMap((object, index) =>
    isPlainRecord(object) && object['sniptaleId'] === source.sniptaleId ? [index] : []
  );
  const position = matches[0];
  const current = serializeEditorCanvasObject(source);
  // Source clipping is a derived projection and is omitted by the export owner as well.
  delete current.clipPath;
  if (
    matches.length !== 1 ||
    position === undefined ||
    !sameJsonValue(current, objects[position])
  ) {
    await canvas.loadFromJSON(canvasJson);
    return;
  }
  const renderOnAddRemove = canvas.renderOnAddRemove;
  try {
    await canvas.loadFromJSON(
      JSON.stringify({ ...serialized, objects: objects.filter((_, index) => index !== position) }),
      (_serialized: unknown, object: unknown, error?: unknown) => {
        if (error !== undefined) throw error;
        if (object === undefined) throw new Error('Editor object restoration failed.');
      }
    );
  } finally {
    canvas.renderOnAddRemove = renderOnAddRemove;
  }
  // Reject partial hydration before Fabric clears the scene. The old source stays
  // attached on failure; there is no second resource cache or lifetime.
  canvas.insertAt(position, source);
}
