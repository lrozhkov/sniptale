type CommentDraftFinalizer = () => boolean;

let activeFinalizer: CommentDraftFinalizer | null = null;

/** Registers the single Design Review comment draft owned by the active overlay surface. */
export function registerDesignReviewCommentDraftFinalizer(
  finalizer: CommentDraftFinalizer
): () => void {
  activeFinalizer = finalizer;
  return () => {
    if (activeFinalizer === finalizer) {
      activeFinalizer = null;
    }
  };
}

/** Commits the active draft before any destructive Design Review session transition. */
export function finalizeDesignReviewCommentDraft(): void {
  if (activeFinalizer && !activeFinalizer()) {
    throw new Error('Design Review comment draft could not be saved');
  }
}
