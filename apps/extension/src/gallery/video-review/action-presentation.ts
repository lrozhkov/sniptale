import {
  patchReviewKeys,
  type ReviewKeyPatch,
} from '../../features/video/review/advanced/key-animation';
import {
  patchReviewClicks,
  type ReviewClickStyle,
} from '../../features/video/review/advanced/click-animation';
import { translate } from '../../platform/i18n';
import type { useReviewEditorState } from './use-editor-state';
type PresentationState = Pick<
  ReturnType<typeof useReviewEditorState>,
  | 'busy'
  | 'editing'
  | 'canStart'
  | 'advanced'
  | 'setMode'
  | 'setActiveSelection'
  | 'activeSelection'
  | 'setMessage'
  | 'setClickAnimations'
  | 'setKeyAnimations'
>;

/** Keyboard settings share the advanced-content transaction; source events remain untouched. */
export function changeRecordedKeys(
  state: PresentationState,
  ids: readonly string[],
  patch: ReviewKeyPatch | null
) {
  if (state.busy || state.editing.exporter.phase !== 'idle' || !state.canStart()) return;
  try {
    patchReviewKeys(state.advanced.keyAnimations ?? [], ids, patch);
    state.setKeyAnimations((current) => patchReviewKeys(current, ids, patch));
    if (patch?.enabled && state.advanced.ui.mode !== 'advanced') {
      state.setMode('advanced');
      state.setActiveSelection(state.activeSelection);
    }
  } catch {
    state.setMessage(translate('gallery.videoReview.clickLimit'));
  }
}

/** Both single and bulk edits use the existing advanced-content transaction and admission. */
export function changeRecordedClicks(
  state: PresentationState,
  ids: readonly string[],
  patch: Partial<ReviewClickStyle> | null
) {
  if (state.busy || state.editing.exporter.phase !== 'idle' || !state.canStart()) return;
  try {
    patchReviewClicks(state.advanced.clickAnimations ?? [], ids, patch);
    state.setClickAnimations((current) => patchReviewClicks(current, ids, patch));
    if (patch?.effect && patch.effect !== 'off' && state.advanced.ui.mode !== 'advanced') {
      state.setMode('advanced');
      state.setActiveSelection(state.activeSelection);
    }
  } catch {
    state.setMessage(translate('gallery.videoReview.clickLimit'));
  }
}
