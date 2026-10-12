import { isRecord, isBoundedNumber } from '../../project/validation/primitives';

/** Recorded identity is scoped by kind; an action and signal may share their opaque ID. */
export interface ReviewActionAudioRef {
  kind: 'action' | 'signal';
  id: string;
}
export type ReviewActionAudioPreset =
  | 'mouse-classic-v1'
  | 'mouse-alternate-v1'
  | 'mouse-soft-v1'
  | 'keyboard-v1'
  | 'typing-natural-v1';
export type ReviewActionAudioFamily = 'mouse' | 'keyboard' | 'typing';
export interface ReviewActionAudioStyle {
  enabled: boolean;
  presetId: ReviewActionAudioPreset | null;
  volume: number;
  offset: number;
}
export interface ReviewActionAudioSetting extends ReviewActionAudioStyle {
  ref: ReviewActionAudioRef;
}
export interface ReviewActionAudioTarget {
  ref: ReviewActionAudioRef;
  family: ReviewActionAudioFamily;
}
export type ReviewActionAudioPatch = Partial<ReviewActionAudioStyle>;

export const REVIEW_ACTION_AUDIO_DEFAULT: Readonly<ReviewActionAudioStyle> = {
  enabled: false,
  presetId: null,
  volume: 0.35,
  offset: 0,
};
const defaultPresets: Record<ReviewActionAudioFamily, ReviewActionAudioPreset> = {
  mouse: 'mouse-classic-v1',
  keyboard: 'keyboard-v1',
  typing: 'typing-natural-v1',
};

/** Stable identity encoding has no delimiter collision and does not depend on locale. */
export const reviewActionAudioRefKey = (ref: ReviewActionAudioRef): string =>
  JSON.stringify([ref.kind, ref.id]);

export function isReviewActionAudioPreset(value: unknown): value is ReviewActionAudioPreset {
  return (
    value === 'mouse-classic-v1' ||
    value === 'mouse-alternate-v1' ||
    value === 'mouse-soft-v1' ||
    value === 'keyboard-v1' ||
    value === 'typing-natural-v1'
  );
}

export function reviewActionAudioPresetFamily(
  preset: ReviewActionAudioPreset
): ReviewActionAudioFamily {
  if (preset === 'keyboard-v1') return 'keyboard';
  if (preset === 'typing-natural-v1') return 'typing';
  return 'mouse';
}

/** Missing legacy content stays absent; malformed/duplicate authored settings refuse admission. */
export function parseReviewActionAudio(
  raw: unknown
): ReviewActionAudioSetting[] | undefined | null {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length > 10_000) return null;
  const result: ReviewActionAudioSetting[] = [];
  const identities = new Set<string>();
  for (const value of raw) {
    if (
      !isRecord(value) ||
      Object.keys(value).some(
        (key) => !['ref', 'enabled', 'presetId', 'volume', 'offset'].includes(key)
      )
    )
      return null;
    const ref = value['ref'];
    const presetId = value['presetId'];
    if (
      !isRecord(ref) ||
      Object.keys(ref).some((key) => key !== 'kind' && key !== 'id') ||
      (ref['kind'] !== 'action' && ref['kind'] !== 'signal') ||
      typeof ref['id'] !== 'string' ||
      !ref['id'].trim() ||
      ref['id'].length > 256 ||
      typeof value['enabled'] !== 'boolean' ||
      (presetId !== null && !isReviewActionAudioPreset(presetId)) ||
      (value['enabled'] && presetId === null) ||
      !isBoundedNumber(value['volume'], 0, 1) ||
      !isBoundedNumber(value['offset'], -2, 2)
    )
      return null;
    const identity: ReviewActionAudioRef = { kind: ref['kind'], id: ref['id'] };
    const key = reviewActionAudioRefKey(identity);
    if (identities.has(key)) return null;
    identities.add(key);
    result.push({
      ref: identity,
      enabled: value['enabled'],
      presetId,
      volume: value['volume'],
      offset: value['offset'],
    });
  }
  return result.sort((left, right) => {
    const a = reviewActionAudioRefKey(left.ref),
      b = reviewActionAudioRefKey(right.ref);
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/** One functional batch changes only explicitly selected compatible recorded identities. */
export function patchReviewActionAudio(
  current: readonly ReviewActionAudioSetting[],
  targets: readonly ReviewActionAudioTarget[],
  patch: ReviewActionAudioPatch | null
): ReviewActionAudioSetting[] {
  const values = new Map(current.map((setting) => [reviewActionAudioRefKey(setting.ref), setting]));
  for (const target of targets) {
    const key = reviewActionAudioRefKey(target.ref);
    if (patch === null) {
      values.delete(key);
      continue;
    }
    if (patch.presetId && reviewActionAudioPresetFamily(patch.presetId) !== target.family) continue;
    const style = { ...REVIEW_ACTION_AUDIO_DEFAULT, ...values.get(key), ...patch };
    if (patch.presetId === null) style.enabled = false;
    else if (patch.presetId) style.enabled = true;
    else if (
      style.enabled &&
      (!style.presetId ||
        (patch.enabled === true && reviewActionAudioPresetFamily(style.presetId) !== target.family))
    )
      style.presetId = defaultPresets[target.family];
    values.set(key, { ...style, ref: { ...target.ref } });
  }
  const parsed = parseReviewActionAudio([...values.values()]);
  if (!parsed) throw new Error('Action audio settings are invalid.');
  return parsed;
}
