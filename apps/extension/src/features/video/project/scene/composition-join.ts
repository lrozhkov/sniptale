import { parseGlTransitionSelection, type GlTransitionSelection } from '../transition/gl-catalog';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';

/** Authored result-time portions around a cut; effective bounds never retime the montage. */
export type CompositionJoinSettings = { before: number; after: number } & (
  | {
      type: 'gl';
      selection: GlTransitionSelection;
      easing: 'LINEAR' | 'EASE_IN_OUT';
      color?: never;
    }
  | { type: 'dissolve' | 'fade-black'; color?: string }
);

/** Preserves Gallery wire admission; each root owns its unknown-field policy. */
export function parseCompositionJoinSettings(value: unknown): CompositionJoinSettings | null {
  if (!isRecord(value)) return null;
  const type = value['type'];
  const before = value['before'];
  const after = value['after'];
  if (
    (type !== 'dissolve' && type !== 'fade-black' && type !== 'gl') ||
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
  if (type === 'gl') {
    const selection = parseGlTransitionSelection(value['selection']);
    const easing = value['easing'];
    if (
      !selection ||
      (easing !== 'LINEAR' && easing !== 'EASE_IN_OUT') ||
      Object.keys(value).some(
        (key) => !['type', 'before', 'after', 'selection', 'easing'].includes(key)
      )
    )
      return null;
    return { type, before, after, selection, easing };
  }
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
export function evaluateCompositionJoin(
  time: number,
  seam: number,
  before: number,
  after: number,
  easing: 'LINEAR' | 'EASE_IN_OUT' = 'LINEAR'
) {
  if (!(time >= seam - before && time < seam + after) || before + after <= 0) return null;
  const raw = (time - seam + before) / (before + after);
  const incoming =
    easing === 'LINEAR' ? raw : raw < 0.5 ? 4 * raw ** 3 : 1 - (-2 * raw + 2) ** 3 / 2;
  const beforeSeam = time < seam;
  const black = beforeSeam ? 1 - (seam - time) / before : 1 - (time - seam) / after;
  return { incoming, beforeSeam, black: Math.max(0, Math.min(1, black)) };
}

/** Fits two authored cut portions to one shared retained island. */
export function fitCompositionJoinPortions(outgoing: number, incoming: number, available: number) {
  const requested = outgoing + incoming;
  return requested > available
    ? { outgoing: (outgoing * available) / requested, incoming: (incoming * available) / requested }
    : { outgoing, incoming };
}
