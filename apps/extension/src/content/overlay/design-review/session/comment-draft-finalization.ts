type CommentDraftFinalizer = () => boolean;

let activeFinalizer: CommentDraftFinalizer | null = null;
let activePendingReader: (() => boolean) | null = null;
const listeners = new Set<() => void>();

export function hasPendingDesignReviewCommentDraft(): boolean {
  return activePendingReader?.() === true;
}

export function subscribeToDesignReviewCommentDraft(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyDesignReviewCommentDraftChanged(): void {
  listeners.forEach((listener) => listener());
}

/** Registers the single Design Review comment draft owned by the active overlay surface. */
export function registerDesignReviewCommentDraftFinalizer(
  finalizer: CommentDraftFinalizer,
  hasPendingChanges?: () => boolean
): () => void {
  activeFinalizer = finalizer;
  activePendingReader = hasPendingChanges ?? null;
  notifyDesignReviewCommentDraftChanged();
  return () => {
    if (activeFinalizer === finalizer) {
      activeFinalizer = null;
      activePendingReader = null;
      notifyDesignReviewCommentDraftChanged();
    }
  };
}

/** Commits the active draft before any destructive Design Review session transition. */
export function finalizeDesignReviewCommentDraft(): void {
  if (activeFinalizer && !activeFinalizer()) {
    throw new Error('Design Review comment draft could not be saved');
  }
}
