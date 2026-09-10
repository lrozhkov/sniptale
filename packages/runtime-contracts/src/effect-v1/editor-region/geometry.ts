import type { EffectV1Document } from '../model/types.js';
import type { ControlDefinition } from '../model/base.js';

export type EffectV1RegionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};
type Size = { width: number; height: number };
type Values = Readonly<Record<string, unknown>>;
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));
function numberControl(
  doc: EffectV1Document,
  id: string
): Extract<ControlDefinition, { kind: 'number' }> {
  const control = doc.controls.find((c) => c.id === id);
  if (control?.kind !== 'number') throw new Error(`Invalid region control: ${id}`);
  return control;
}
function geometry(doc: EffectV1Document, size: Size) {
  if (!doc.editorRegion) throw new Error('Document has no editor region.');
  if (![size.width, size.height].every((v) => Number.isFinite(v) && v > 0))
    throw new Error('Expected a positive finite target size.');
  return {
    region: doc.editorRegion,
    pad: doc.editorRegion.inset * Math.min(size.width, size.height),
  };
}
function value(doc: EffectV1Document, values: Values, id: string): number {
  const control = numberControl(doc, id);
  const current = Object.hasOwn(values, id) ? values[id] : control.defaultValue;
  if (typeof current !== 'number' || !Number.isFinite(current))
    throw new Error(`Invalid region value: ${id}`);
  return clamp(current, control.min!, control.max!);
}

/** Resolve a validated declaration in logical target coordinates, before scene placement. */
export function resolveEffectV1EditorRegion(
  doc: EffectV1Document,
  controls: Values,
  size: Size
): EffectV1RegionRect | null {
  if (!doc.editorRegion) return null;
  const { region, pad } = geometry(doc, size);
  const width = (size.width * value(doc, controls, region.widthControl)) / 100;
  const height = (size.height * value(doc, controls, region.heightControl)) / 100;
  return {
    width,
    height,
    x: pad + ((size.width - 2 * pad - width) * value(doc, controls, region.xControl)) / 100,
    y: pad + ((size.height - 2 * pad - height) * value(doc, controls, region.yControl)) / 100,
  };
}

/** Return one four-control patch for an already inverse-transformed drag/resize rectangle. */
export function updateEffectV1EditorRegion(
  doc: EffectV1Document,
  controls: Values,
  rect: EffectV1RegionRect,
  size: Size
): Record<string, number> {
  const { region, pad } = geometry(doc, size);
  if (
    ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
    rect.width <= 0 ||
    rect.height <= 0
  )
    throw new Error('Expected a finite rectangle with positive dimensions.');
  const bounded = (id: string, v: number) => {
    const c = numberControl(doc, id);
    return clamp(v, c.min!, c.max!);
  };
  const width = bounded(region.widthControl, (rect.width / size.width) * 100);
  const height = bounded(region.heightControl, (rect.height / size.height) * 100);
  const spanX = size.width * (1 - width / 100) - 2 * pad;
  const spanY = size.height * (1 - height / 100) - 2 * pad;
  return {
    [region.widthControl]: width,
    [region.heightControl]: height,
    [region.xControl]: bounded(
      region.xControl,
      spanX > 1e-9 ? ((rect.x - pad) / spanX) * 100 : value(doc, controls, region.xControl)
    ),
    [region.yControl]: bounded(
      region.yControl,
      spanY > 1e-9 ? ((rect.y - pad) / spanY) * 100 : value(doc, controls, region.yControl)
    ),
  };
}
