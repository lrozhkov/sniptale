import { walkAllDocuments } from '../../platform/frame';

const PREVIOUS_USER_SELECT_ATTR = 'data-sniptale-prev-user-select';
const PREVIOUS_WEBKIT_USER_SELECT_ATTR = 'data-sniptale-prev-webkit-user-select';

function storeBodySelectionStyles(body: HTMLElement): void {
  if (!body.hasAttribute(PREVIOUS_USER_SELECT_ATTR)) {
    body.setAttribute(PREVIOUS_USER_SELECT_ATTR, body.style.userSelect);
  }

  if (!body.hasAttribute(PREVIOUS_WEBKIT_USER_SELECT_ATTR)) {
    body.setAttribute(PREVIOUS_WEBKIT_USER_SELECT_ATTR, body.style.webkitUserSelect);
  }
}

function restoreBodySelectionStyles(body: HTMLElement): void {
  body.style.userSelect = body.getAttribute(PREVIOUS_USER_SELECT_ATTR) ?? '';
  body.style.webkitUserSelect = body.getAttribute(PREVIOUS_WEBKIT_USER_SELECT_ATTR) ?? '';
  body.removeAttribute(PREVIOUS_USER_SELECT_ATTR);
  body.removeAttribute(PREVIOUS_WEBKIT_USER_SELECT_ATTR);
}

export function applyHighlighterDocumentMode(enabled: boolean) {
  walkAllDocuments((doc) => {
    if (!doc.body) {
      return;
    }

    if (enabled) {
      storeBodySelectionStyles(doc.body);
      doc.body.classList.add('sniptale-highlighter-mode');
      doc.body.style.userSelect = 'none';
      doc.body.style.webkitUserSelect = 'none';
      return;
    }

    doc.body.classList.remove('sniptale-highlighter-mode');
    restoreBodySelectionStyles(doc.body);
  });
}
