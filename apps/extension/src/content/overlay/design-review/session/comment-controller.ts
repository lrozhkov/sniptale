import type { PageStyleSelectionSnapshot } from '../../../selection/design-review/snapshot';
import { usePageStyleCommentDraft } from './comment-draft';
import { useDesignReviewCommentVoiceInput } from './comment-voice-input';

export function useDesignReviewCommentController(args: {
  open: boolean;
  selection: PageStyleSelectionSnapshot | null;
}) {
  const draft = usePageStyleCommentDraft(args);
  const voice = useDesignReviewCommentVoiceInput({ updateDraft: draft.updateCommentDraft });

  return {
    close: draft.closeComment,
    draftActions: {
      commit: draft.commitComment,
      endComposition: draft.endCommentComposition,
      startComposition: draft.startCommentComposition,
      updateDraft: draft.updateCommentDraft,
    },
    startVoice: (caretPosition: number) => {
      void voice.actions.start(draft.commentDraft, caretPosition);
    },
    stopVoice: voice.actions.stop,
    view: {
      comment: {
        commitFailed: draft.commentCommitFailed,
        draft: draft.commentDraft,
        marker: draft.markerNumber,
      },
      voice: voice.state,
    },
  };
}
