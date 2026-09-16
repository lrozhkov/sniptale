import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { EditorDocument } from './types';

/** Geometry flags omitted from SourceState but persisted on its canvas object. */
function sourceShape(document: EditorDocument): string | null {
  let canvas: unknown;
  try {
    canvas = JSON.parse(document.canvasJson);
  } catch {
    return null;
  }
  if (!isRecord(canvas) || !Array.isArray(canvas['objects'])) return null;
  const sources = [];
  for (const object of canvas['objects']) {
    if (!isRecord(object) || Array.isArray(object['objects'])) return null;
    if (object['sniptaleType'] === 'source-image' || object['sniptaleRole'] === 'source')
      sources.push(object);
  }
  if (sources.length > 1) return null;
  const source = sources[0] ?? {};
  const numbers = ['angle', 'skewX', 'skewY', 'cropX', 'cropY'].map((key) =>
    key in source ? source[key] : 0
  );
  if (!numbers.every((value) => typeof value === 'number' && Number.isFinite(value))) return null;
  const flips = ['flipX', 'flipY'].map((key) => (key in source ? source[key] : false));
  if (!flips.every((value) => typeof value === 'boolean')) return null;
  if (source['visible'] === false) return null;
  return JSON.stringify({
    numbers,
    flips,
    source: source['src'] ?? document.sourceImageData,
    width: source['width'] ?? document.sourceWidth,
    height: source['height'] ?? document.sourceHeight,
    originX: source['originX'] ?? 'left',
    originY: source['originY'] ?? 'top',
    filters: source['filters'] ?? [],
  });
}

/** A conservative annotation-only proof; any unsupported geometry change requires positional review. */
export function hasSameEditorImageGeometry(before: EditorDocument, after: EditorDocument): boolean {
  const fields = [
    'sourceImageData',
    'sourceWidth',
    'sourceHeight',
    'canvasWidth',
    'canvasHeight',
    'sourceLeft',
    'sourceTop',
    'sourceDisplayWidth',
    'sourceDisplayHeight',
  ] as const;
  if (fields.some((key) => before[key] !== after[key])) return false;
  const shape = sourceShape(before);
  return shape !== null && shape === sourceShape(after);
}
