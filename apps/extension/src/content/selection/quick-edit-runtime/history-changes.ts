const QUICK_EDIT_CHANGE_EVENT = 'sniptale-document-mode-history-changed';

/** Owner signal reaches the top content runtime even when input occurs in an editable iframe. */
export function notifyQuickEditChanges(): void {
  window.dispatchEvent(new Event(QUICK_EDIT_CHANGE_EVENT));
}

export function subscribeToQuickEditChanges(listener: () => void): () => void {
  window.addEventListener(QUICK_EDIT_CHANGE_EVENT, listener);
  return () => window.removeEventListener(QUICK_EDIT_CHANGE_EVENT, listener);
}
