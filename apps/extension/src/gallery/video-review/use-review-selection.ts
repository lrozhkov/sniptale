import { useEffect, useState } from 'react';
import type {
  ReviewDocument,
  ReviewOperation,
  ReviewSelection,
} from '../../features/video/review/types';
import type { QuickEditAdvancedState } from '../../features/video/review/advanced/types';

/** Builds the history deletion represented by a text or edit selection. */
export function selectedHistoryRemoval(
  selection: ReviewSelection,
  document: ReviewDocument
): ReviewOperation | null {
  const at = Date.now();
  if (selection.kind === 'edit') {
    const before = document.edits.find((item) => item.id === selection.id);
    return before ? { id: crypto.randomUUID(), at, target: 'edit', before, after: null } : null;
  }
  if (selection.kind === 'annotation') {
    const before = document.annotations.find((item) => item.id === selection.id);
    return before
      ? { id: crypto.randomUUID(), at, target: 'annotation', before, after: null }
      : null;
  }
  return null;
}

/** Invalid selections never remain as hidden keyboard targets after history changes. */
export function reviewSelectionExists(
  selection: ReviewSelection,
  document: ReviewDocument,
  advanced: QuickEditAdvancedState
): boolean {
  if (selection.kind === 'none') return false;
  if (selection.kind === 'edit') return document.edits.some((item) => item.id === selection.id);
  if (selection.kind === 'annotation')
    return document.annotations.some((item) => item.id === selection.id);
  if (selection.kind === 'canvas-comment')
    return document.canvasComments.some((item) => item.id === selection.id);
  if (selection.kind === 'zoom')
    return advanced.zoom.regions.some((item) => item.id === selection.id);
  if (selection.kind === 'audio')
    return advanced.audio[selection.lane].some((item) => item.id === selection.id);
  return false;
}

/**
 * One active selection owner: Delete, the inspector, handles, and keyboard
 * navigation read it from here, so a stale edit never hides behind a newer
 * selection. Not persistent content; invalid ids clear to none.
 */
export function useReviewSelection() {
  const [selection, setSelection] = useState<ReviewSelection>({ kind: 'none' });
  return { selection, setSelection };
}

/** Binds the shared selection to deletion and invalidation without owning lane state. */
export function useReviewSelectionLifecycle(args: {
  selection: ReviewSelection;
  setSelection(selection: ReviewSelection): void;
  document: ReviewDocument;
  advanced: QuickEditAdvancedState;
  commit(operation: ReviewOperation): Promise<unknown>;
  run(action: () => Promise<unknown>): Promise<unknown>;
  deleteCanvas(id: string): void;
  deleteZoom(id: string): void;
  deleteAudio(lane: 'voiceover' | 'music', id: string): void;
  clearAnnotation(): void;
}) {
  const remove = () => {
    if (args.selection.kind === 'none') return;
    const historyRemoval = selectedHistoryRemoval(args.selection, args.document);
    if (historyRemoval) void args.run(() => args.commit(historyRemoval));
    else if (args.selection.kind === 'canvas-comment') args.deleteCanvas(args.selection.id);
    else if (args.selection.kind === 'zoom') args.deleteZoom(args.selection.id);
    else if (args.selection.kind === 'audio')
      args.deleteAudio(args.selection.lane, args.selection.id);
    args.setSelection({ kind: 'none' });
  };
  useEffect(() => {
    if (
      args.selection.kind !== 'none' &&
      !reviewSelectionExists(args.selection, args.document, args.advanced)
    )
      args.setSelection({ kind: 'none' });
  }, [args]);
  useEffect(() => {
    if (args.selection.kind !== 'annotation') args.clearAnnotation();
  }, [args]);
  return remove;
}
