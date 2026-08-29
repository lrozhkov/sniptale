const HIGHLIGHTER_MODE_BODY_CLASS = 'sniptale-highlighter-mode';
const PREVIOUS_USER_SELECT_ATTRIBUTE = 'data-sniptale-prev-user-select';
const PREVIOUS_WEBKIT_USER_SELECT_ATTRIBUTE = 'data-sniptale-prev-webkit-user-select';
const TRANSIENT_INTERACTION_BODY_CLASSES = [
  HIGHLIGHTER_MODE_BODY_CLASS,
  'sniptale-navigation-locked',
  'sniptale-no-select',
] as const;

function restoreHighlighterSelectionStyle(body: HTMLElement): void {
  const previousUserSelect = body.getAttribute(PREVIOUS_USER_SELECT_ATTRIBUTE);
  const previousWebkitUserSelect = body.getAttribute(PREVIOUS_WEBKIT_USER_SELECT_ATTRIBUTE);
  body.style.userSelect = previousUserSelect ?? '';
  body.style.webkitUserSelect = previousWebkitUserSelect ?? '';
  body.removeAttribute(PREVIOUS_USER_SELECT_ATTRIBUTE);
  body.removeAttribute(PREVIOUS_WEBKIT_USER_SELECT_ATTRIBUTE);
}

/** Removes interaction-only Highlighter state from the detached static document. */
export function normalizePreparedSnapshotInteractionState(snapshot: Document): void {
  const body = snapshot.body;
  if (!body) return;
  if (body.classList.contains(HIGHLIGHTER_MODE_BODY_CLASS)) {
    restoreHighlighterSelectionStyle(body);
  }
  body.classList.remove(...TRANSIENT_INTERACTION_BODY_CLASSES);
}
