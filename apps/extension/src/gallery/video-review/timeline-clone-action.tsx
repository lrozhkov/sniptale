import type { ReviewSelection } from '../../features/video/review/types';
import { useState, type ReactNode } from 'react';
import { Copy } from 'lucide-react';
import { translate } from '../../platform/i18n';
import type { ReviewDocument } from '../../features/video/review/types';
import type { QuickEditAdvancedState } from '../../features/video/review/advanced/types';
import type { LoadedReview } from './use-session';
import { ReviewButton, reviewTextButtonClassName } from './controls';
import { ReviewInspectorCloneContext } from './inspector-sections';
import { canCloneReviewSelection, cloneReviewTimelineSelection } from './timeline-clone';
import { commitReviewTimelineClonePlan } from './timeline-clone-commit';

type MutationCommands = {
  session: LoadedReview['session'];
  run(action: () => Promise<unknown>): Promise<unknown>;
  flushAdvanced(): Promise<void>;
  canStart(): boolean;
  setMessage(message: string): void;
};

/** Single and multi-selection use the same copy planner and durable history owners. */
export function ReviewTimelineCloneScope({
  document,
  advanced,
  selection,
  commands,
  busy,
  duration,
  children,
}: {
  document: ReviewDocument;
  advanced: QuickEditAdvancedState;
  selection: ReviewSelection;
  busy: boolean;
  commands: MutationCommands;
  duration: number;
  children: ReactNode;
}) {
  const [pending, setPending] = useState(false);
  // These inspectors already expose a copy command through their own authoring owner.
  const available =
    selection.kind !== 'cursor-motion' &&
    selection.kind !== 'zoom' &&
    selection.kind !== 'annotation-effect' &&
    canCloneReviewSelection(selection, advanced, [selection], document.edits);
  const disabled = pending || busy;
  const copy = async () => {
    if (!available || disabled || !commands.canStart()) return;
    setPending(true);
    try {
      await commands.run(async () => {
        await commands.flushAdvanced();
        const document = commands.session.getSnapshot().document;
        const plan = cloneReviewTimelineSelection({
          content: document.advancedContent,
          edits: document.edits,
          selections: [selection],
          duration,
        });
        if (!plan) {
          commands.setMessage(translate('gallery.videoReview.timelineSelectionCloneUnavailable'));
          return;
        }
        await commitReviewTimelineClonePlan(
          commands.session,
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
