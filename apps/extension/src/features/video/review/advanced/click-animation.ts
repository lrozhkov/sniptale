import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { normalizePaintColor } from '@sniptale/foundation/paint';
import { isBoundedNumber } from '../../project/validation/primitives';

/** Authored presentation only; recorded time, coordinates and cursor samples stay immutable. */
export interface ReviewClickStyle {
  effect: 'off' | 'ripple' | 'press' | 'glow';
  color: string;
  radius: number;
  stroke: number;
  /** Legacy multiplier retained for history replay; new colors carry their own alpha. */
  opacity: number;
  before: number;
  after: number;
  offset: number;
  x: number;
  y: number;
  pulses: number;
  easing: 'linear' | 'ease-out' | 'ease-in-out';
}
export interface ReviewClickAnimation extends ReviewClickStyle {
  id: string;
}
const REVIEW_CLICK_LIMIT = 10_000;
export const REVIEW_CLICK_DEFAULT: Readonly<ReviewClickStyle> = {
  effect: 'off',
  color: '#ffffffcc',
  radius: 32,
  stroke: 2,
  opacity: 1,
  before: 0,
  after: 0.6,
  offset: 0,
  x: 0,
  y: 0,
  pulses: 1,
  easing: 'ease-out',
};

/** Bounds shared by authored controls and the persisted boundary. Times are result seconds. */
export const REVIEW_CLICK_BOUNDS = {
  radius: [2, 200],
  stroke: [0.5, 20],
  opacity: [0, 1],
  before: [0, 2],
  after: [0.05, 5],
  offset: [-2, 2],
  x: [-1, 1],
  y: [-1, 1],
  pulses: [1, 5],
} as const;

/** Strict optional-content parser: legacy absence stays absent; invalid settings reject. */
export function parseReviewClickAnimations(
  raw: unknown
): ReviewClickAnimation[] | undefined | null {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length > REVIEW_CLICK_LIMIT) return null;
  const result: ReviewClickAnimation[] = [];
  const ids = new Set<string>();
  for (const item of raw) {
    const parsed = parseClick(item);
    if (!parsed || ids.has(parsed.id)) return null;
    ids.add(parsed.id);
    result.push(parsed);
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}

function parseClick(raw: unknown): ReviewClickAnimation | null {
  if (
    !isRecord(raw) ||
    typeof raw['id'] !== 'string' ||
    !raw['id'].trim() ||
    raw['id'].length > 256
  )
    return null;
  const effect = raw['effect'];
  const easing = raw['easing'];
  const color = typeof raw['color'] === 'string' ? normalizePaintColor(raw['color']) : null;
  if (
    !color ||
    !['off', 'ripple', 'press', 'glow'].some((value) => effect === value) ||
    !['linear', 'ease-out', 'ease-in-out'].some((value) => easing === value)
  )
    return null;
  const numbers = { ...REVIEW_CLICK_DEFAULT };
  for (const key of Object.keys(REVIEW_CLICK_BOUNDS) as (keyof typeof REVIEW_CLICK_BOUNDS)[]) {
    const value = raw[key];
    const [min, max] = REVIEW_CLICK_BOUNDS[key];
    if (!isBoundedNumber(value, min, max) || (key === 'pulses' && !Number.isInteger(value)))
      return null;
    numbers[key] = value;
  }
  if (
    (effect !== 'off' && effect !== 'ripple' && effect !== 'press' && effect !== 'glow') ||
    (easing !== 'linear' && easing !== 'ease-out' && easing !== 'ease-in-out')
  )
    return null;
  return { id: raw['id'], ...numbers, effect, easing, color };
}

/** One functional batch patch preserves untouched fields and never mutates recorded events. */
export function patchReviewClicks(
  current: readonly ReviewClickAnimation[],
  ids: readonly string[],
  patch: Partial<ReviewClickStyle> | null
): ReviewClickAnimation[] {
  const selected = new Set(ids);
  const values = new Map(current.map((item) => [item.id, item]));
  for (const id of selected) {
    if (patch === null) values.delete(id);
    else values.set(id, { ...REVIEW_CLICK_DEFAULT, ...values.get(id), ...patch, id });
  }
  const result = parseReviewClickAnimations([...values.values()]);
  if (!result) throw new Error('Click presentation is invalid.');
  return result;
}
