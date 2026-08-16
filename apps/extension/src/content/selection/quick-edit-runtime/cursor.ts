import { mountStyleInAccessibleDocuments, walkAllDocuments } from '../../platform/frame';
import {
  QUICK_EDIT_CURSOR_STYLE_ID,
  QUICK_EDIT_CURSOR_URL,
  QUICK_EDIT_DOCUMENT_MODE_BODY_CLASS,
  QUICK_EDIT_TEXT_CURSOR_BODY_CLASS,
} from './style.constants';
import type { QuickEditOverlayState } from './overlay.state';
import { mountQuickEditDocumentCursorTracking } from './document-cursor';

function mountQuickEditCursorStyle(): () => void {
  return mountStyleInAccessibleDocuments({
    styleId: QUICK_EDIT_CURSOR_STYLE_ID,
    textContent: `
    body,
    body * {
      cursor: ${QUICK_EDIT_CURSOR_URL} !important;
    }
    body {
      user-select: none !important;
      -webkit-user-select: none !important;
    }
    .sniptale-editing,
    .sniptale-editing:focus,
    [contenteditable='true'],
    [contenteditable='true']:focus,
    [contenteditable='plaintext-only'],
    [contenteditable='plaintext-only']:focus {
      outline: none !important;
      box-shadow: none !important;
    }
    .sniptale-editing,
    .sniptale-editing * {
      cursor: text !important;
      user-select: text !important;
    }
    body.${QUICK_EDIT_DOCUMENT_MODE_BODY_CLASS},
    body.${QUICK_EDIT_DOCUMENT_MODE_BODY_CLASS} * {
      cursor: default !important;
    }
    body.${QUICK_EDIT_DOCUMENT_MODE_BODY_CLASS}.${QUICK_EDIT_TEXT_CURSOR_BODY_CLASS},
    body.${QUICK_EDIT_DOCUMENT_MODE_BODY_CLASS}.${QUICK_EDIT_TEXT_CURSOR_BODY_CLASS} * {
      cursor: text !important;
    }
    body.${QUICK_EDIT_DOCUMENT_MODE_BODY_CLASS} {
      user-select: text !important;
      -webkit-user-select: text !important;
    }
    .sniptale-extension-surface,
    .sniptale-extension-surface * {
      cursor: default !important;
    }
    .sniptale-extension-surface button:not(:disabled),
    .sniptale-extension-surface button:not(:disabled) *,
    .sniptale-extension-surface [role="button"]:not([aria-disabled="true"]),
    .sniptale-extension-surface [role="button"]:not([aria-disabled="true"]) *,
    .sniptale-extension-surface [role="menuitem"]:not([aria-disabled="true"]),
    .sniptale-extension-surface [role="menuitem"]:not([aria-disabled="true"]) *,
    .sniptale-extension-surface a[href],
    .sniptale-extension-surface a[href] * {
      cursor: pointer !important;
    }
    .sniptale-extension-surface :is(input, textarea, select, [contenteditable]),
    .sniptale-extension-surface [contenteditable] * {
      cursor: auto !important;
    }
  `,
  });
}

export function enableQuickEditCursor(state: QuickEditOverlayState): void {
  walkAllDocuments((doc) => {
    if (!doc.body) {
      return;
    }

    doc.body.classList.add('sniptale-quick-edit-mode');
  });

  state.cleanupCursorStyle?.();
  const cleanupStyle = mountQuickEditCursorStyle();
  const cleanupCursorTracking = mountQuickEditDocumentCursorTracking();
  state.cleanupCursorStyle = () => {
    cleanupCursorTracking();
    cleanupStyle();
  };
  state.cursorStyleElement = document.getElementById(
    QUICK_EDIT_CURSOR_STYLE_ID
  ) as HTMLStyleElement | null;
}

export function disableQuickEditCursor(state: QuickEditOverlayState): void {
  walkAllDocuments((doc) => {
    if (!doc.body) {
      return;
    }

    doc.body.classList.remove('sniptale-quick-edit-mode');
  });

  state.cleanupCursorStyle?.();
  state.cleanupCursorStyle = null;
  state.cursorStyleElement?.remove();
  state.cursorStyleElement = null;
}
