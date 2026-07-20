import { type KeyboardEvent, useEffect, useState } from 'react';

function sanitizeDimension(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(1, parsed) : fallback;
}

/**
 * Keeps the inline numeric draft local to the size-control field while delegating committed values
 * back to the owning image/canvas/export seam.
 */
export function useDimensionDraftState(value: number, onCommit: (value: number) => void) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    const nextDraft = String(value);
    setDraft((currentDraft) => (currentDraft === nextDraft ? currentDraft : nextDraft));
  }, [value]);

  const resetDraft = () => {
    setDraft(String(value));
  };

  const commitDraft = () => {
    if (draft.trim().length === 0) {
      resetDraft();
      return;
    }

    onCommit(sanitizeDimension(draft, value));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      commitDraft();
    }

    if (event.key === 'Escape') {
      resetDraft();
    }
  };

  return {
    commitDraft,
    draft,
    handleKeyDown,
    setDraft,
  };
}
