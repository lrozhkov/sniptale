import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';

/** Authored result-time portions around a cut; effective bounds never retime the montage. */
export interface ReviewCutTransition {
  type: 'dissolve' | 'fade-black';
  /** Absent in legacy transitions; resolves to opaque black without rewriting history. */
  color?: string;
  before: number;
  after: number;
}

export function parseCutTransition(value: unknown): ReviewCutTransition | null {
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
