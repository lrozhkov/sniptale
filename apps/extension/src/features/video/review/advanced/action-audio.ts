import {
  parseReviewActionAudio,
  reviewActionAudioPresetFamily,
  reviewActionAudioRefKey,
} from '../../project/action-feedback/validation';
import type {
  ReviewActionAudioFamily,
  ReviewActionAudioPreset,
  ReviewActionAudioSetting,
  ReviewActionAudioTarget,
  ReviewActionAudioStyle,
  ReviewActionAudioPatch,
} from '../../project/action-feedback/types';
export type {
  ReviewActionAudioFamily,
  ReviewActionAudioPreset,
  ReviewActionAudioRef,
  ReviewActionAudioSetting,
  ReviewActionAudioTarget,
  ReviewActionAudioStyle,
  ReviewActionAudioPatch,
} from '../../project/action-feedback/types';
export {
  parseReviewActionAudio,
  reviewActionAudioPresetFamily,
  reviewActionAudioRefKey,
  isReviewActionAudioPreset,
} from '../../project/action-feedback/validation';

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
      style.presetId = target.recorded
        ? target.family === 'mouse'
          ? 'mouse-classic-paired-v2'
          : target.family === 'keyboard'
            ? 'keyboard-recorded-v2'
            : 'typing-recorded-v2'
        : defaultPresets[target.family];
    values.set(key, { ...style, ref: { ...target.ref } });
  }
  const parsed = parseReviewActionAudio([...values.values()]);
  if (!parsed) throw new Error('Action audio settings are invalid.');
  return parsed;
}
