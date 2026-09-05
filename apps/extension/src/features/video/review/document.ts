import type { ReviewDocument, ReviewOperation, ReviewSource } from './types';

function replaceItem<T extends { id: string }>(items: T[], before: T | null, after: T | null): T[] {
  const id = before?.id ?? after?.id;
  if (!id || (before && after && before.id !== after.id)) {
    throw new Error('Review operation identity is invalid.');
  }
  const existing = items.find((item) => item.id === id) ?? null;
  if (JSON.stringify(existing) !== JSON.stringify(before)) {
    throw new Error('Review operation does not match the current document.');
  }
  if (JSON.stringify(before) === JSON.stringify(after)) {
    throw new Error('Review operation has no change.');
  }
  return [...items.filter((item) => item.id !== id), ...(after ? [after] : [])].sort((a, b) =>
    a.id.localeCompare(b.id)
  );
}

/** Applies a validated operation without changing its inputs or the original media. */
export function applyReviewOperation(
  document: ReviewDocument,
  operation: ReviewOperation,
  source: ReviewSource
): ReviewDocument {
  if (operation.target === 'annotation') {
    return {
      ...document,
      annotations: replaceItem(document.annotations, operation.before, operation.after),
    };
  }
  const edits = replaceItem(document.edits, operation.before, operation.after);
  const ordered = [...edits].sort((a, b) => a.start - b.start);
  let previousEnd = 0;
  let removed = 0;
  for (const edit of ordered) {
    if (edit.start < previousEnd) throw new Error('Review edit ranges overlap.');
    previousEnd = edit.end;
    if (edit.kind === 'cut') removed += edit.end - edit.start;
  }
  if (removed >= source.duration) throw new Error('Review cuts remove the entire video.');
  return { ...document, edits };
}

/** Reconstructs the selected history position. Redo entries remain in the stored history. */
export function replayReviewHistory(
  history: readonly ReviewOperation[],
  cursor: number,
  source: ReviewSource
): ReviewDocument {
  if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > history.length) {
    throw new Error('Review history cursor is invalid.');
  }
  let document: ReviewDocument = { annotations: [], edits: [] };
  for (const operation of history.slice(0, cursor)) {
    document = applyReviewOperation(document, operation, source);
  }
  return document;
}
