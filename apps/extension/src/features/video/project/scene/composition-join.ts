import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';

/** Authored result-time portions around a cut; effective bounds never retime the montage. */
export interface CompositionJoinSettings {
  type: 'dissolve' | 'fade-black';
  /** Absent in legacy transitions; resolves to opaque black without rewriting history. */
  color?: string;
  before: number;
  after: number;
}

/** Preserves Gallery wire admission; each root owns its unknown-field policy. */
export function parseCompositionJoinSettings(value: unknown): CompositionJoinSettings | null {
  if (!isRecord(value)) return null;
  const type = value['type'];
  const before = value['before'];
  const after = value['after'];
  if (
    (type !== 'dissolve' && type !== 'fade-black') ||
    typeof before !== 'number' ||
    !Number.isFinite(before) ||
    typeof after !== 'number' ||
    !Number.isFinite(after) ||
    before < 0 ||
    after < 0 ||
    before + after <= 0 ||
    before + after > 60
  )
    return null;
  const color = value['color'];
  if (color !== undefined && (typeof color !== 'string' || !/^#[0-9a-f]{6}(?:ff)?$/i.test(color)))
    return null;
  return { type, before, after, ...(color === undefined ? {} : { color }) };
}

/**
 * Evaluates an admitted composition seam on the caller's clock. All four values
 * use the same unit; this profile neither selects frames nor changes their time.
 * The start is included and the end is excluded, also for one-sided windows.
 */
export function evaluateCompositionJoin(time: number, seam: number, before: number, after: number) {
  if (!(time >= seam - before && time < seam + after) || before + after <= 0) return null;
  const incoming = (time - seam + before) / (before + after);
  const beforeSeam = time < seam;
  const black = beforeSeam ? 1 - (seam - time) / before : 1 - (time - seam) / after;
  return { incoming, beforeSeam, black: Math.max(0, Math.min(1, black)) };
}
