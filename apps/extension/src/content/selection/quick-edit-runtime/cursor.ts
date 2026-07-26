import { mountStyleInAccessibleDocuments, walkAllDocuments } from '../../platform/frame';
import {
  QUICK_EDIT_CURSOR_STYLE_ID,
  QUICK_EDIT_CURSOR_URL,
  QUICK_EDIT_DOCUMENT_MODE_BODY_CLASS,
} from './style.constants';
import type { QuickEditOverlayState } from './overlay.state';

export function enableQuickEditCursor(state: QuickEditOverlayState): void {
  walkAllDocuments((doc) => {
    if (!doc.body) {
      return;
    }

    doc.body.classList.add('sniptale-quick-edit-mode');
  });

  state.cleanupCursorStyle?.();
  state.cleanupCursorStyle = mountStyleInAccessibleDocuments({
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
      cursor: auto !important;
    }
    body.${QUICK_EDIT_DOCUMENT_MODE_BODY_CLASS} {
      user-select: text !important;
      -webkit-user-select: text !important;
    }
    body.${QUICK_EDIT_DOCUMENT_MODE_BODY_CLASS} .sniptale-toolbar,
    body.${QUICK_EDIT_DOCUMENT_MODE_BODY_CLASS} .sniptale-toolbar *,
    body.${QUICK_EDIT_DOCUMENT_MODE_BODY_CLASS} .sniptale-modal,
    body.${QUICK_EDIT_DOCUMENT_MODE_BODY_CLASS} .sniptale-modal *,
    .sniptale-toolbar,
    .sniptale-toolbar *,
    .sniptale-modal,
    .sniptale-modal * {
      cursor: pointer !important;
    }
  `,
  });
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
