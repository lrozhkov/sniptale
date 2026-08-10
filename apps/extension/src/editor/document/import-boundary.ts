// policyStateIds: [] - parser sets and resource ceilings are immutable document import policy,
// not mutable authority or capability state.
import type { DrawingObject } from '../../features/drawing/public';

const DRAWING_TYPES = new Set(['pencil', 'marker', 'shape', 'arrow', 'blur', 'text']);
const REMOVED_EDITOR_OBJECT_TYPES = new Set([
  'brush',
  'callout',
  'diamond',
  'ellipse',
  'eraser',
  'fill',
  'highlighter',
  'line',
  'rectangle',
]);
const REMOVED_METADATA_PREFIXES = ['sniptaleBrush', 'sniptaleLine', 'sniptaleTextCallout'];
const REMOVED_METADATA_KEYS = new Set([
  'sniptaleArrowEndHead',
  'sniptaleArrowMode',
  'sniptaleArrowStartHead',
  'sniptaleArrowType',
  'sniptaleArrowVariant',
  'sniptaleBlurAmount',
  'sniptaleBlurShowBorder',
  'sniptaleBlurStrokeColor',
  'sniptaleBlurStrokeStyle',
  'sniptaleBlurStrokeWidth',
  'sniptaleBlurType',
]);
const SHAPE_KINDS = new Set(['rectangle', 'ellipse', 'triangle', 'parallelogram']);
const MAX_ABSOLUTE_COORDINATE = 131_072;
const MAX_DRAWING_SAMPLES = 50_000;
const MAX_TEXT_LENGTH = 200_000;
const MAX_FABRIC_TREE_DEPTH = 40;
const MAX_FABRIC_TREE_NODES = 20_000;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteBoundedNumber(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Math.abs(value) <= MAX_ABSOLUTE_COORDINATE
  );
}

function isPositiveSize(value: unknown): value is number {
  return isFiniteBoundedNumber(value) && value >= 0;
}

function isPoint(value: unknown): value is UnknownRecord {
  return isRecord(value) && isFiniteBoundedNumber(value['x']) && isFiniteBoundedNumber(value['y']);
}

function isBounds(value: unknown): value is UnknownRecord {
  return isPoint(value) && isPositiveSize(value['width']) && isPositiveSize(value['height']);
}

function isColor(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

function hasValidRotation(value: UnknownRecord): boolean {
  return value['rotation'] === undefined || isFiniteBoundedNumber(value['rotation']);
}

function isShapeObject(value: UnknownRecord): boolean {
  return (
    SHAPE_KINDS.has(String(value['kind'])) &&
    isBounds(value['bounds']) &&
    isColor(value['color']) &&
    (value['fillColor'] === undefined ||
      value['fillColor'] === null ||
      isColor(value['fillColor'])) &&
    (value['skewX'] === undefined || isFiniteBoundedNumber(value['skewX'])) &&
    isPositiveSize(value['width']) &&
    hasValidRotation(value)
  );
}

function isFreehandObject(value: UnknownRecord): boolean {
  if (value['kind'] !== 'pencil' && value['kind'] !== 'marker') return false;
  const samples = value['samples'];
  return (
    Array.isArray(samples) &&
    samples.length > 0 &&
    samples.length <= MAX_DRAWING_SAMPLES &&
    samples.every((sample) => isPoint(sample) && isFiniteBoundedNumber(sample['t'])) &&
    isColor(value['color']) &&
    isPositiveSize(value['width']) &&
    (value['kind'] === 'pencil' ||
      (isFiniteBoundedNumber(value['opacity']) &&
        value['opacity'] >= 0 &&
        value['opacity'] <= 1)) &&
    hasValidRotation(value)
  );
}

function isDrawingObject(value: unknown): value is UnknownRecord {
  if (!isRecord(value) || typeof value['id'] !== 'string' || value['id'].length === 0) return false;
  if (isFreehandObject(value) || isShapeObject(value)) return true;
  if (value['kind'] === 'arrow') {
    return (
      isPoint(value['start']) &&
      isPoint(value['end']) &&
      isColor(value['color']) &&
      (value['design'] === undefined ||
        value['design'] === 'standard' ||
        value['design'] === 'freehand') &&
      typeof value['dynamicWidth'] === 'boolean' &&
      isPositiveSize(value['width'])
    );
  }
  if (value['kind'] === 'blur') return isBounds(value['bounds']) && hasValidRotation(value);
  if (value['kind'] === 'text') {
    return (
      isBounds(value['bounds']) &&
      typeof value['text'] === 'string' &&
      value['text'].length <= MAX_TEXT_LENGTH &&
      isColor(value['color']) &&
      (value['backgroundColor'] === null || isColor(value['backgroundColor'])) &&
      (value['fontFamily'] === undefined ||
        value['fontFamily'] === 'sans' ||
        value['fontFamily'] === 'serif' ||
        value['fontFamily'] === 'mono' ||
        value['fontFamily'] === 'handwritten') &&
      isPositiveSize(value['fontSize']) &&
      hasValidRotation(value)
    );
  }
  return false;
}

function expectedObjectType(kind: unknown): string {
  return SHAPE_KINDS.has(String(kind)) ? 'shape' : String(kind);
}

export function parseEditorDrawingMetadata(value: unknown): DrawingObject | null {
  let metadata: unknown = value;
  if (typeof value === 'string') {
    try {
      metadata = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!isRecord(metadata) || metadata['version'] !== 1 || !isDrawingObject(metadata['object'])) {
    return null;
  }
  return metadata['object'] as unknown as DrawingObject;
}

function assertDrawingFabricObject(value: UnknownRecord): void {
  const objectType = value['sniptaleType'];
  if (
    REMOVED_EDITOR_OBJECT_TYPES.has(String(objectType)) ||
    Object.keys(value).some(
      (key) =>
        REMOVED_METADATA_KEYS.has(key) ||
        REMOVED_METADATA_PREFIXES.some((prefix) => key.startsWith(prefix))
    )
  ) {
    throw new Error('Removed editor drawing object');
  }
  const serializedMetadata = value['sniptaleDrawingJson'];
  if (!DRAWING_TYPES.has(String(objectType)) && serializedMetadata === undefined) return;
  if (!DRAWING_TYPES.has(String(objectType)) || typeof serializedMetadata !== 'string') {
    throw new Error('Invalid editor drawing object');
  }
  const drawing = parseEditorDrawingMetadata(serializedMetadata);
  if (!drawing) {
    throw new Error('Invalid editor drawing metadata');
  }
  if (
    value['sniptaleId'] !== drawing.id ||
    String(objectType) !== expectedObjectType(drawing.kind)
  ) {
    throw new Error('Mismatched editor drawing metadata');
  }
}

function assertDrawingFabricObjectTree(roots: readonly unknown[]): void {
  const pending: Array<{ depth: number; value: unknown }> = roots.map((value) => ({
    depth: 0,
    value,
  }));
  let nodes = 0;
  while (pending.length > 0) {
    const entry = pending.pop()!;
    nodes += 1;
    if (nodes > MAX_FABRIC_TREE_NODES || entry.depth > MAX_FABRIC_TREE_DEPTH) {
      throw new Error('Invalid editor canvas object tree');
    }
    if (!isRecord(entry.value)) throw new Error('Invalid editor canvas object');
    assertDrawingFabricObject(entry.value);

    const children = entry.value['objects'];
    if (children !== undefined) {
      if (!Array.isArray(children)) throw new Error('Invalid editor canvas object children');
      for (const child of children) pending.push({ depth: entry.depth + 1, value: child });
    }
    if (entry.value['clipPath'] !== undefined) {
      pending.push({ depth: entry.depth + 1, value: entry.value['clipPath'] });
    }
  }
}

export function assertValidEditorDrawingCanvasJson(canvasJson: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(canvasJson);
  } catch {
    throw new Error('Invalid editor canvas JSON');
  }
  if (!isRecord(parsed) || !Array.isArray(parsed['objects'])) {
    throw new Error('Invalid editor canvas objects');
  }
  assertDrawingFabricObjectTree(parsed['objects']);
}
