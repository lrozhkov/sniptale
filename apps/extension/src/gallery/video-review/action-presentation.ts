import {
  patchReviewKeys,
  type ReviewKeyPatch,
} from '../../features/video/project/action-feedback/key-animation';
import {
  patchReviewClicks,
  type ReviewClickStyle,
} from '../../features/video/review/advanced/click-animation';
import { translate } from '../../platform/i18n';
import {
  patchReviewActionAudio,
  type ReviewActionAudioTarget,
  type ReviewActionAudioPatch,
  type ReviewActionAudioStyle,
} from '../../features/video/review/advanced/action-audio';
import { buildReviewActionAudioPlan } from '../../features/video/review/action-audio';
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

/** One guarded continuation flushes preceding content, then submits a patch-only history batch. */
export async function changeRecordedActionAudio(
  state: PresentationState &
    Pick<
      ReturnType<typeof useReviewEditorState>,
      'setActionAudio' | 'flushAdvanced' | 'performAction'
    >,
  targets: readonly ReviewActionAudioTarget[],
  patch: ReviewActionAudioPatch | null
) {
  if (state.busy || state.editing.exporter.phase !== 'idle' || !state.canStart()) return;
  try {
    patchReviewActionAudio(state.advanced.actionAudio ?? [], targets, patch);
  } catch {
    state.setMessage(translate('gallery.videoReview.actionAudioSettingsLimit'));
    return;
  }
  try {
    await state.performAction(async () => {
      await state.flushAdvanced();
      if (state.busy || state.editing.exporter.phase !== 'idle' || !state.canStart()) return false;
      state.setActionAudio((current) => patchReviewActionAudio(current, targets, patch));
      if ((patch?.enabled === true || patch?.presetId) && state.advanced.ui.mode !== 'advanced') {
        state.setMode('advanced');
        state.setActiveSelection(state.activeSelection);
      }
      return true;
    });
  } catch {
    state.setMessage(translate('gallery.videoReview.saveFailed'));
  }
}

/** Audition borrows the same graph and normalized fact; it never stages document content. */
export function auditionRecordedActionAudio(
  state: Pick<
    ReturnType<typeof useReviewEditorState>,
    'busy' | 'editing' | 'canStart' | 'projected' | 'timeline' | 'actionSoundPreview'
  >,
  target: ReviewActionAudioTarget,
  style: ReviewActionAudioStyle
) {
  if (state.busy || state.editing.exporter.phase !== 'idle' || !state.canStart()) return;
  const marker = state.projected.markers.find(
    (marker) => marker.ref.kind === target.ref.kind && marker.ref.id === target.ref.id
  );
  if (!marker) return;
  state.actionSoundPreview.audition(
    buildReviewActionAudioPlan({
      markers: [marker],
      settings: [{ ...style, enabled: true, ref: target.ref }],
      segments: state.timeline.timeMap.getSegments(),
      applied: true,
    })
  );
}

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
  state: PresentationState & Pick<ReturnType<typeof useReviewEditorState>, 'projected'>,
  ids: readonly string[],
  patch: Partial<ReviewClickStyle> | null
) {
  if (state.busy || state.editing.exporter.phase !== 'idle' || !state.canStart()) return;
  try {
    patchReviewClicks(state.advanced.clickAnimations ?? [], ids, patch, state.projected.markers);
    state.setClickAnimations((current) =>
      patchReviewClicks(current, ids, patch, state.projected.markers)
    );
    if (patch?.effect && patch.effect !== 'off' && state.advanced.ui.mode !== 'advanced') {
      state.setMode('advanced');
      state.setActiveSelection(state.activeSelection);
    }
  } catch {
    state.setMessage(translate('gallery.videoReview.clickLimit'));
  }
}
