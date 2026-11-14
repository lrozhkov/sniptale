import { z } from 'zod';
const unit = z.number().finite().min(0).max(1);
const scalar = (min: number, max: number) => z.number().finite().min(min).max(max);
const base = z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u),
  enabled: z.boolean(),
  intensity: unit,
});
const filter = z.discriminatedUnion('kind', [
  base.extend({
    kind: z.literal('color'),
    parameters: z.strictObject({
      brightness: scalar(0, 4),
      exposure: scalar(-4, 4),
      contrast: scalar(0, 4),
      saturation: scalar(0, 4),
      temperature: scalar(-1, 1),
      tint: scalar(-1, 1),
    }),
  }),
  base.extend({ kind: z.literal('monochrome'), parameters: z.strictObject({}) }),
  base.extend({ kind: z.literal('sepia'), parameters: z.strictObject({}) }),
  base.extend({
    kind: z.literal('sharpen'),
    parameters: z.strictObject({ strength: scalar(0, 4) }),
  }),
  base.extend({
    kind: z.literal('pixelate'),
    parameters: z.strictObject({ size: scalar(0, 128) }),
  }),
  base.extend({
    kind: z.literal('vignette'),
    parameters: z.strictObject({ amount: unit, radius: scalar(0, 2), softness: scalar(0, 2) }),
  }),
  base.extend({
    kind: z.literal('grain'),
    parameters: z.strictObject({ amount: unit, seed: z.number().int().min(0).max(0xffffffff) }),
  }),
  base.extend({ kind: z.literal('blur'), parameters: z.strictObject({ radius: scalar(0, 64) }) }),
  base.extend({
    kind: z.literal('bloom'),
    parameters: z.strictObject({ threshold: unit, radius: scalar(0, 64), gain: scalar(0, 4) }),
  }),
]);
const stack = z
  .strictObject({ version: z.literal(1), filters: z.array(filter).max(16) })
  .refine((value) => new Set(value.filters.map((entry) => entry.id)).size === value.filters.length);
export type SourceImageFilter = z.infer<typeof filter>;
export type SourceImageFilterStack = z.infer<typeof stack>;
export type SourceImageFilterSize = { width: number; height: number };
export class SourceImageFilterError extends Error {
  constructor() {
    super('Source image filters are invalid or unavailable.');
    this.name = 'SourceImageFilterError';
  }
}
/** Stored order and identity are authored data. Unknown operations never become silent no-ops. */
export function parseSourceImageFilterStack(value: unknown): SourceImageFilterStack | null {
  const parsed = stack.safeParse(value);
  return parsed.success ? parsed.data : null;
}
export function createSourceImageFilter(
  kind: SourceImageFilter['kind'],
  id: string
): SourceImageFilter {
  const common = { id, enabled: true, intensity: 1 };
  switch (kind) {
    case 'color':
      return {
        ...common,
        kind,
        parameters: {
          brightness: 1,
          exposure: 0,
          contrast: 1,
          saturation: 1,
          temperature: 0,
          tint: 0,
        },
      };
    case 'monochrome':
    case 'sepia':
      return { ...common, kind, parameters: {} };
    case 'sharpen':
      return { ...common, kind, parameters: { strength: 1 } };
    case 'pixelate':
      return { ...common, kind, parameters: { size: 8 } };
    case 'vignette':
      return { ...common, kind, parameters: { amount: 0.5, radius: 0.5, softness: 0.5 } };
    case 'grain':
      return { ...common, kind, parameters: { amount: 0.1, seed: 1337 } };
    case 'blur':
      return { ...common, kind, parameters: { radius: 8 } };
    case 'bloom':
      return { ...common, kind, parameters: { threshold: 0.5, radius: 8, gain: 1 } };
  }
}
/** Neutral values bypass pixel production without deleting their retained stack entries. */
export function hasSourceImageFilters(value: SourceImageFilterStack): boolean {
  return value.filters.some((entry) => {
    if (!entry.enabled || entry.intensity === 0) return false;
    switch (entry.kind) {
      case 'monochrome':
      case 'sepia':
        return true;
      case 'sharpen':
        return entry.parameters.strength !== 0;
      case 'pixelate':
        return entry.parameters.size !== 0;
      case 'vignette':
      case 'grain':
        return entry.parameters.amount !== 0;
      case 'blur':
        return entry.parameters.radius !== 0;
      case 'bloom':
        return entry.parameters.gain !== 0;
      case 'color': {
        const p = entry.parameters;
        return (
          p.brightness !== 1 ||
          p.exposure !== 0 ||
          p.contrast !== 1 ||
          p.saturation !== 1 ||
          p.temperature !== 0 ||
          p.tint !== 0
        );
      }
    }
  });
}

/** GPU source filters run before the existing display orientation transform. */
export function sourceImageFilterPlaneSize(
  display: SourceImageFilterSize,
  rotation: 0 | 90 | 180 | 270 = 0
): SourceImageFilterSize {
  return rotation === 90 || rotation === 270
    ? { width: display.height, height: display.width }
    : { ...display };
}
