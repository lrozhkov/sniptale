import {
  isImageDataUrl,
  readImageDataUrlDimensions,
} from '@sniptale/runtime-contracts/validation/data-url';
import { parseSimplifySettings } from '../simplify/settings';
import { parseColor } from '@sniptale/foundation/color';
import { isNumber, isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  DRAWING_TEXT_FONT_FAMILIES,
  MAX_DRAWING_ARROW_BENDS,
  type DrawingBounds,
  type DrawingDocument,
  type DrawingSimplifySnapshot,
  type DrawingObject,
  type DrawingPoint,
  type DrawingSample,
  type DrawingShapeKind,
} from './model';

const MAX_OBJECTS = 10_000;
const MAX_SAMPLES = 1_000_000;
const MAX_TEXT = 1_000_000;
// Two 16-megapixel RGBA planes need at most 128 MiB before render working buffers.
const MAX_SNAPSHOT_PIXELS = 16_777_216;
// The common validator limits each encoded image to 25 MiB; cap aggregate retention too.
const MAX_SNAPSHOT_CHARACTERS = Math.ceil((25 * 1024 * 1024 * 4) / 3) + 128;
type Budget = {
  samples: number;
  text: number;
  snapshotCharacters: number;
  snapshotPixels: number;
  snapshots: Map<string, DrawingSimplifySnapshot>;
};

function snapshot(value: unknown, budget: Budget): DrawingSimplifySnapshot | null {
  if (!isPlainRecord(value)) return null;
  const { dataUrl, width, height } = value;
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width * height > MAX_SNAPSHOT_PIXELS ||
    typeof dataUrl !== 'string' ||
    dataUrl.length > MAX_SNAPSHOT_CHARACTERS ||
    !dataUrl.startsWith('data:image/png;base64,')
  )
    return null;
  const retained = budget.snapshots.get(dataUrl);
  if (retained) return retained.width === width && retained.height === height ? retained : null;
  if (
    width * height > budget.snapshotPixels ||
    dataUrl.length > budget.snapshotCharacters ||
    !isImageDataUrl(dataUrl)
  )
    return null;
  const dimensions = readImageDataUrlDimensions(dataUrl);
  if (!dimensions || dimensions.width !== width || dimensions.height !== height) return null;
  budget.snapshotCharacters -= dataUrl.length;
  budget.snapshotPixels -= width * height;
  const admitted = { dataUrl, width, height };
  budget.snapshots.set(dataUrl, admitted);
  return admitted;
}

/** Admits one bounded local PNG plane without allocating a decoded bitmap. */
export function parseDrawingSimplifySnapshot(value: unknown): DrawingSimplifySnapshot | null {
  return snapshot(value, {
    samples: 0,
    text: 0,
    snapshotCharacters: MAX_SNAPSHOT_CHARACTERS,
    snapshotPixels: MAX_SNAPSHOT_PIXELS,
    snapshots: new Map(),
  });
}

function simplify(
  value: Record<string, unknown>,
  id: string,
  budget: Budget
): DrawingObject | null {
  const rect = bounds(value['bounds']);
  const angle = rotation(value);
  const settings = parseSimplifySettings(value['settings']);
  const sourceDirty = value['sourceDirty'];
  const engineVersion = value['engineVersion'];
  if (
    engineVersion !== undefined &&
    (typeof engineVersion !== 'string' ||
      engineVersion.length > 128 ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(engineVersion))
  )
    return null;
  if (
    !rect ||
    !angle ||
    !settings ||
    (sourceDirty !== undefined && typeof sourceDirty !== 'boolean')
  )
    return null;
  const result = value['result'] === undefined ? undefined : snapshot(value['result'], budget);
  const source = value['source'] === undefined ? undefined : snapshot(value['source'], budget);
  const sourceBounds =
    value['source'] === undefined
      ? undefined
      : isPlainRecord(value['source'])
        ? bounds(value['source']['bounds'])
        : null;
  if (result === null || source === null || sourceBounds === null) return null;
  return {
    id,
    kind: 'simplify',
    bounds: rect,
    settings,
    ...angle,
    ...(result === undefined ? {} : { result }),
    ...(sourceDirty === undefined ? {} : { sourceDirty }),
    ...(engineVersion === undefined ? {} : { engineVersion }),
    ...(source === undefined || sourceBounds === undefined
      ? {}
      : { source: { ...source, bounds: sourceBounds } }),
  };
}

function isColor(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 128 &&
    value.trim() === value &&
    parseColor(value) !== null
  );
}
function isPositive(value: unknown): value is number {
  return isNumber(value) && value > 0;
}
function point(value: unknown): DrawingPoint | null {
  return isPlainRecord(value) && isNumber(value['x']) && isNumber(value['y'])
    ? { x: value['x'], y: value['y'] }
    : null;
}
function bounds(value: unknown): DrawingBounds | null {
  const origin = point(value);
  if (
    !origin ||
    !isPlainRecord(value) ||
    !isNumber(value['width']) ||
    !isNumber(value['height']) ||
    value['width'] < 0 ||
    value['height'] < 0
  )
    return null;
  return { ...origin, width: value['width'], height: value['height'] };
}
function rotation(value: Record<string, unknown>): { rotation?: number } | null {
  const angle = value['rotation'];
  return angle === undefined ? {} : isNumber(angle) ? { rotation: angle } : null;
}
function samples(value: unknown, budget: Budget): DrawingSample[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > budget.samples) return null;
  budget.samples -= value.length;
  const parsed: DrawingSample[] = [];
  for (const sample of value) {
    const position = point(sample);
    if (!position || !isPlainRecord(sample) || !isNumber(sample['t'])) return null;
    parsed.push({ ...position, t: sample['t'] });
  }
  return parsed;
}
function stroke(
  value: Record<string, unknown>,
  id: string,
  kind: 'pencil' | 'marker',
  budget: Budget
): DrawingObject | null {
  const path = samples(value['samples'], budget);
  const angle = rotation(value);
  if (!path || !angle || !isColor(value['color']) || !isPositive(value['width'])) return null;
  const base = { id, samples: path, color: value['color'], width: value['width'], ...angle };
  if (kind === 'pencil') return { ...base, kind };
  const opacity = value['opacity'];
  return isNumber(opacity) && opacity >= 0 && opacity <= 1 ? { ...base, kind, opacity } : null;
}
function shape(
  value: Record<string, unknown>,
  id: string,
  kind: DrawingShapeKind
): DrawingObject | null {
  const rect = bounds(value['bounds']);
  const angle = rotation(value);
  const fill = value['fillColor'];
  const skew = value['skewX'];
  if (
    !rect ||
    !angle ||
    !isColor(value['color']) ||
    !isPositive(value['width']) ||
    (fill !== undefined && fill !== null && !isColor(fill)) ||
    (skew !== undefined && !isNumber(skew))
  )
    return null;
  return {
    id,
    kind,
    bounds: rect,
    color: value['color'],
    width: value['width'],
    ...angle,
    ...(fill === undefined ? {} : { fillColor: fill }),
    ...(skew === undefined ? {} : { skewX: skew }),
  };
}
function arrow(value: Record<string, unknown>, id: string): DrawingObject | null {
  const start = point(value['start']);
  const end = point(value['end']);
  const design = value['design'];
  if (
    !start ||
    !end ||
    !isColor(value['color']) ||
    !isPositive(value['width']) ||
    typeof value['dynamicWidth'] !== 'boolean' ||
    (design !== undefined && design !== 'standard' && design !== 'freehand')
  )
    return null;
  const bends = value['bendPoints'];
  let parsedBends: DrawingPoint[] | undefined;
  if (bends !== undefined) {
    if (!Array.isArray(bends) || bends.length > MAX_DRAWING_ARROW_BENDS) return null;
    parsedBends = [];
    for (const bend of bends) {
      const parsed = point(bend);
      if (!parsed) return null;
      parsedBends.push(parsed);
    }
  }
  return {
    id,
    kind: 'arrow',
    start,
    end,
    color: value['color'],
    width: value['width'],
    dynamicWidth: value['dynamicWidth'],
    ...(design === undefined ? {} : { design }),
    ...(parsedBends === undefined ? {} : { bendPoints: parsedBends }),
  };
}
function blur(value: Record<string, unknown>, id: string): DrawingObject | null {
  const rect = bounds(value['bounds']);
  const angle = rotation(value);
  const amount = value['amount'];
  if (!rect || !angle || (amount !== undefined && (!isNumber(amount) || amount < 0))) return null;
  return { id, kind: 'blur', bounds: rect, ...angle, ...(amount === undefined ? {} : { amount }) };
}
function text(value: Record<string, unknown>, id: string, budget: Budget): DrawingObject | null {
  const rect = bounds(value['bounds']);
  const angle = rotation(value);
  const content = value['text'];
  const background = value['backgroundColor'];
  const font = value['fontFamily'];
  const family = DRAWING_TEXT_FONT_FAMILIES.find((candidate) => candidate === font);
  if (
    !rect ||
    !angle ||
    typeof content !== 'string' ||
    content.length > budget.text ||
    !isColor(value['color']) ||
    !isPositive(value['fontSize']) ||
    (background !== null && !isColor(background)) ||
    (font !== undefined && family === undefined)
  )
    return null;
  budget.text -= content.length;
  return {
    id,
    kind: 'text',
    bounds: rect,
    text: content,
    color: value['color'],
    backgroundColor: background,
    fontSize: value['fontSize'],
    ...angle,
    ...(family === undefined ? {} : { fontFamily: family }),
  };
}
function object(value: unknown, budget: Budget): DrawingObject | null {
  if (
    !isPlainRecord(value) ||
    typeof value['id'] !== 'string' ||
    !value['id'].length ||
    value['id'].length > 256
  )
    return null;
  const id = value['id'];
  switch (value['kind']) {
    case 'pencil':
    case 'marker':
      return stroke(value, id, value['kind'], budget);
    case 'rectangle':
    case 'ellipse':
    case 'triangle':
    case 'parallelogram':
      return shape(value, id, value['kind']);
    case 'arrow':
      return arrow(value, id);
    case 'simplify':
      return simplify(value, id, budget);
    case 'blur':
      return blur(value, id);
    case 'text':
      return text(value, id, budget);
    default:
      return null;
  }
}

/** Admits current authored drawing data without DOM access, source mutation, or executable fields. */
export function parseDrawingDocument(value: unknown): DrawingDocument | null {
  if (
    !isPlainRecord(value) ||
    (value['version'] !== 1 && value['version'] !== 2) ||
    !Array.isArray(value['objects']) ||
    value['objects'].length > MAX_OBJECTS
  )
    return null;
  const parsed: DrawingObject[] = [];
  const identities = new Set<string>();
  const budget: Budget = {
    samples: MAX_SAMPLES,
    text: MAX_TEXT,
    snapshotCharacters: MAX_SNAPSHOT_CHARACTERS * 2,
    snapshotPixels: MAX_SNAPSHOT_PIXELS * 2,
    snapshots: new Map(),
  };
  for (const candidate of value['objects']) {
    const item = object(candidate, budget);
    if (!item || (value['version'] === 1 && item.kind === 'simplify') || identities.has(item.id))
      return null;
    identities.add(item.id);
    parsed.push(item);
  }
  if (value['version'] === 2) return { version: 2, objects: parsed };
  return { version: 1, objects: parsed.filter((item) => item.kind !== 'simplify') };
}
