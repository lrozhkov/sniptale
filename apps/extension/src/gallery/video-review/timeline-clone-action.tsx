import { useState, type ReactNode } from 'react';
import { Copy } from 'lucide-react';
import { translate } from '../../platform/i18n';
import type { useReviewEditorState } from './use-editor-state';
import { ReviewButton, reviewTextButtonClassName } from './controls';
import { ReviewInspectorCloneContext } from './inspector-sections';
import { canCloneReviewSelection, cloneReviewTimelineSelection } from './timeline-clone';
import { commitReviewTimelineClonePlan } from './timeline-clone-commit';

type State = Pick<
  ReturnType<typeof useReviewEditorState>,
  | 'activeSelection'
  | 'advanced'
  | 'busy'
  | 'editing'
  | 'session'
  | 'run'
  | 'flushAdvanced'
  | 'canStart'
  | 'setMessage'
>;

/** Single and multi-selection use the same copy planner and durable history owners. */
export function ReviewTimelineCloneScope({
  state,
  duration,
  children,
}: {
  state: State;
  duration: number;
  children: ReactNode;
}) {
  const [pending, setPending] = useState(false);
  const selection = state.activeSelection;
  // These inspectors already expose a copy command through their own authoring owner.
  const available =
    selection.kind !== 'cursor-motion' &&
    selection.kind !== 'zoom' &&
    selection.kind !== 'annotation-effect' &&
    canCloneReviewSelection(
      selection,
      state.advanced,
      [selection],
      state.session.getSnapshot().document.edits
    );
  const disabled = pending || state.busy || state.editing.exporter.phase !== 'idle';
  const copy = async () => {
    if (!available || disabled || !state.canStart()) return;
    setPending(true);
    try {
      await state.run(async () => {
        await state.flushAdvanced();
        const document = state.session.getSnapshot().document;
        const plan = cloneReviewTimelineSelection({
          content: document.advancedContent,
          edits: document.edits,
          selections: [selection],
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
          selection.kind !== 'edit'
        );
      });
    } finally {
      setPending(false);
    }
  };
  return (
    <ReviewInspectorCloneContext
      value={
        available ? (
          <ReviewButton
            selectionAction="duplicate"
            label={translate('gallery.videoReview.focusDuplicate')}
            disabled={disabled}
            className={`${reviewTextButtonClassName} !w-full justify-start`}
            onClick={() => void copy()}
          >
            <Copy size={15} aria-hidden="true" />
            <span>{translate('gallery.videoReview.focusDuplicate')}</span>
          </ReviewButton>
        ) : null
      }
    >
      {children}
    </ReviewInspectorCloneContext>
  );
}
