import { parseColor } from '@sniptale/foundation/color';
import { isNumber, isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  DRAWING_TEXT_FONT_FAMILIES,
  MAX_DRAWING_ARROW_BENDS,
  type DrawingBounds,
  type DrawingDocumentV1,
  type DrawingObject,
  type DrawingPoint,
  type DrawingSample,
  type DrawingShapeKind,
} from './model';

const MAX_OBJECTS = 10_000;
const MAX_SAMPLES = 1_000_000;
const MAX_TEXT = 1_000_000;
type Budget = { samples: number; text: number };

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
    case 'blur':
      return blur(value, id);
    case 'text':
      return text(value, id, budget);
    default:
      return null;
  }
}

/** Admits current authored drawing data without DOM access, source mutation, or executable fields. */
export function parseDrawingDocument(value: unknown): DrawingDocumentV1 | null {
  if (
    !isPlainRecord(value) ||
    value['version'] !== 1 ||
    !Array.isArray(value['objects']) ||
    value['objects'].length > MAX_OBJECTS
  )
    return null;
  const parsed: DrawingObject[] = [];
  const identities = new Set<string>();
  const budget: Budget = { samples: MAX_SAMPLES, text: MAX_TEXT };
  for (const candidate of value['objects']) {
    const item = object(candidate, budget);
    if (!item || identities.has(item.id)) return null;
    identities.add(item.id);
    parsed.push(item);
  }
  return { version: 1, objects: parsed };
}
