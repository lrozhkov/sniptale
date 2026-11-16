import { useContext, useLayoutEffect, useState } from 'react';
import { Copy, Trash2, Volume2, VolumeX, X } from 'lucide-react';
import { translate } from '../../platform/i18n';
import type { ReviewSelection } from '../../features/video/review/types';
import type { useReviewEditorState } from './use-editor-state';
import { ReviewTimelineMultiSelectionContext } from './selection-actions';
import {
  resolveReviewTimelineSelection,
  removeReviewTimelineSelection,
} from './timeline-batch-selection';
import { canCloneReviewSelection, cloneReviewTimelineSelection } from './timeline-clone';
import { commitReviewTimelineClonePlan } from './timeline-clone-commit';
import { reviewSelectionExists } from './use-review-selection';
import { ReviewInspectorSections, reviewInspectorActions } from './inspector-sections';
import { ReviewButton, reviewDeleteButtonClassName, reviewTextButtonClassName } from './controls';

type State = Pick<
  ReturnType<typeof useReviewEditorState>,
  | 'advanced'
  | 'snapshot'
  | 'projected'
  | 'cursorFocusPath'
  | 'cursorFocusKeys'
  | 'busy'
  | 'editing'
  | 'session'
  | 'run'
  | 'flushAdvanced'
  | 'canStart'
  | 'setMessage'
>;

/** Only the intersection of supported commands is offered for a mixed timeline selection. */
export function ReviewTimelineBatchInspector({
  state,
  duration,
}: {
  state: State;
  duration: number;
}) {
  const group = useContext(ReviewTimelineMultiSelectionContext);
  const [pending, setPending] = useState(false);
  const selections = (group?.keys ?? [])
    .map((key) => resolveReviewTimelineSelection(key, state.advanced))
    .filter(
      (item): item is ReviewSelection =>
        !!item &&
        reviewSelectionExists(
          item,
          state.snapshot.document,
          state.advanced,
          state.projected.markers,
          state.cursorFocusPath,
          state.cursorFocusKeys
        )
    );
  const complete = selections.length === group?.keys.length && selections.length > 1;
  const removable =
    complete &&
    selections.every(
      (item) =>
        item.kind !== 'none' &&
        item.kind !== 'telemetry' &&
        item.kind !== 'webcam' &&
        (item.kind !== 'cursor-focus' ||
          state.cursorFocusPath?.segments.some((part) =>
            part.keys.some((key) => key.id === item.id && key.anchor === 'manual')
          ))
    );
  const cloneable =
    complete &&
    selections.every((item) =>
      canCloneReviewSelection(item, state.advanced, selections, state.snapshot.document.edits)
    );
  const mutableAudio = complete && selections.every((item) => item.kind === 'audio');
  const allMuted =
    mutableAudio &&
    selections.every(
      (item) =>
        item.kind === 'audio' &&
        state.advanced.audio[item.lane].some(
          (clip) => clip.id === item.id && (clip.muted || clip.volume === 0)
        )
    );
  const disabled = pending || state.busy || state.editing.exporter.phase !== 'idle';
  const apply = async (operation: 'remove' | 'mute' | 'clone') => {
    if (
      disabled ||
      !state.canStart() ||
      (operation === 'remove' ? !removable : operation === 'clone' ? !cloneable : !mutableAudio)
    )
      return;
    setPending(true);
    let completed = false;
    try {
      await state.run(async () => {
        await state.flushAdvanced();
        if (operation === 'clone') {
          const document = state.session.getSnapshot().document;
          const plan = cloneReviewTimelineSelection({
            content: document.advancedContent,
            edits: document.edits,
            selections,
            duration,
          });
          if (!plan) {
            state.setMessage(translate('gallery.videoReview.timelineSelectionCloneUnavailable'));
            return;
          }
          await commitReviewTimelineClonePlan(
            state.session,
            document,
            plan,
            selections.some((item) => item.kind !== 'edit')
          );
          completed = true;
          return;
        }
        if (operation === 'remove')
          for (const item of selections) {
            if (item.kind !== 'edit') continue;
            const before = state.session
              .getSnapshot()
              .document.edits.find((edit) => edit.id === item.id);
            if (before)
              await state.session.commit({
                id: crypto.randomUUID(),
                at: Date.now(),
                target: 'edit',
                before,
                after: null,
              });
          }
        const before = state.session.getSnapshot().document.advancedContent;
        const after =
          operation === 'remove'
            ? removeReviewTimelineSelection(before, selections, duration)
            : {
                ...before,
                audio: {
                  ...before.audio,
                  voiceover: before.audio.voiceover.map((clip) =>
                    selections.some(
                      (item) =>
                        item.kind === 'audio' && item.lane === 'voiceover' && item.id === clip.id
                    )
                      ? {
                          ...clip,
                          muted: !allMuted,
                          volume: allMuted && clip.volume === 0 ? 1 : clip.volume,
                        }
                      : clip
                  ),
                  music: before.audio.music.map((clip) =>
                    selections.some(
                      (item) =>
                        item.kind === 'audio' && item.lane === 'music' && item.id === clip.id
                    )
                      ? {
                          ...clip,
                          muted: !allMuted,
                          volume: allMuted && clip.volume === 0 ? 1 : clip.volume,
                        }
                      : clip
                  ),
                },
              };
        if (after !== before)
          await state.session.commit({
            id: crypto.randomUUID(),
            at: Date.now(),
            target: 'advancedContent',
            before,
            after,
          });
        completed = true;
      });
      if (completed && operation === 'remove') group?.clear();
    } finally {
      setPending(false);
    }
  };
  useLayoutEffect(() => {
    if (!group) return;
    const deleteAction = group.deleteAction;
    deleteAction.current = removable && !disabled ? () => void apply('remove') : null;
    return () => {
      deleteAction.current = null;
    };
  });
  return (
    <div data-ui="gallery.videoReview.timelineBatchInspector" className="space-y-3">
      <p className="text-xs text-[var(--sniptale-color-text-secondary)]" role="status">
        {translate('gallery.videoReview.timelineSelectionCount').replace(
          '{count}',
          String(group?.keys.length ?? 0)
        )}
      </p>
      <ReviewInspectorSections
        sections={[
          reviewInspectorActions(
            <>
              {cloneable ? (
                <ReviewButton
                  selectionAction="duplicate"
                  label={translate('gallery.videoReview.timelineSelectionClone')}
                  disabled={disabled}
                  className={`${reviewTextButtonClassName} !w-full justify-start`}
                  onClick={() => void apply('clone')}
                >
                  <Copy size={15} aria-hidden="true" />
                  <span>{translate('gallery.videoReview.timelineSelectionClone')}</span>
                </ReviewButton>
              ) : null}
              {mutableAudio ? (
                <ReviewButton
                  label={translate(
                    allMuted
                      ? 'gallery.videoReview.timelineSelectionUnmute'
                      : 'gallery.videoReview.timelineSelectionMute'
                  )}
                  aria-pressed={allMuted}
                  disabled={disabled}
                  className={`${reviewTextButtonClassName} !w-full justify-start`}
                  onClick={() => void apply('mute')}
                >
                  {allMuted ? (
                    <Volume2 size={15} aria-hidden="true" />
                  ) : (
                    <VolumeX size={15} aria-hidden="true" />
                  )}
                  <span>
                    {translate(
                      allMuted
                        ? 'gallery.videoReview.timelineSelectionUnmute'
                        : 'gallery.videoReview.timelineSelectionMute'
                    )}
                  </span>
                </ReviewButton>
              ) : null}
              {removable ? (
                <ReviewButton
                  selectionAction="delete"
                  label={translate('gallery.videoReview.timelineSelectionDelete')}
                  disabled={disabled}
                  className={`${reviewDeleteButtonClassName} !w-full justify-start`}
                  onClick={() => void apply('remove')}
                >
                  <Trash2 size={15} aria-hidden="true" />
                  <span>{translate('gallery.videoReview.timelineSelectionDelete')}</span>
                </ReviewButton>
              ) : null}
              <ReviewButton
                label={translate('gallery.videoReview.timelineSelectionClear')}
                disabled={disabled}
                className={`${reviewTextButtonClassName} !w-full justify-start`}
                onClick={group?.clear}
              >
                <X size={15} aria-hidden="true" />
                <span>{translate('gallery.videoReview.timelineSelectionClear')}</span>
              </ReviewButton>
            </>
          ),
        ]}
      />
    </div>
  );
}
