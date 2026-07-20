import type { EditableElement } from '../../../features/highlighter/contracts';

type EditableClickHost = HTMLElement & { _sniptaleClickHandler?: (event: MouseEvent) => void };

interface QuickEditSessionOptions {
  editingElements: Map<string, EditableElement>;
  handleChildLinkClick: (event: MouseEvent) => void;
  showBlockingOverlay: () => void;
  hideBlockingOverlay: () => void;
  updateBlockingOverlayShape: (element: HTMLElement) => void;
  setupResizeObserver: (element: HTMLElement) => void;
  disconnectResizeObserver: () => void;
}

export function activateEditableElement(
  element: HTMLElement,
  id: string,
  editableRecord: EditableElement,
  options: QuickEditSessionOptions
): void {
  element.contentEditable = 'true';
  element.classList.add('sniptale-editing');
  element.dataset['sniptaleOriginalText'] = editableRecord.originalText;
  element.dataset['sniptaleEditableId'] = id;

  if (element.tagName.toLowerCase() === 'a' && element.hasAttribute('href')) {
    element.dataset['sniptaleOriginalHref'] = element.getAttribute('href') || '';
    element.removeAttribute('href');
  }

  const handleEditableClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  element.addEventListener('click', handleEditableClick, { capture: true });
  (element as EditableClickHost)._sniptaleClickHandler = handleEditableClick;
  element.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', options.handleChildLinkClick, { capture: true });
  });

  options.editingElements.set(id, editableRecord);
  options.showBlockingOverlay();
  options.updateBlockingOverlayShape(element);
  options.setupResizeObserver(element);
  focusEditableElement(element);
}

export function clearEditableElementState(
  element: HTMLElement,
  id: string,
  options: QuickEditSessionOptions
): void {
  if (element.dataset['sniptaleOriginalHref']) {
    element.setAttribute('href', element.dataset['sniptaleOriginalHref']);
    delete element.dataset['sniptaleOriginalHref'];
  }

  const host = element as EditableClickHost;
  if (host._sniptaleClickHandler) {
    element.removeEventListener('click', host._sniptaleClickHandler, { capture: true });
    delete host._sniptaleClickHandler;
  }

  element.querySelectorAll('a').forEach((link) => {
    link.removeEventListener('click', options.handleChildLinkClick, { capture: true });
  });

  delete element.dataset['sniptaleOriginalText'];
  delete element.dataset['sniptaleEditableId'];
  options.editingElements.delete(id);

  if (options.editingElements.size === 0) {
    options.hideBlockingOverlay();
    options.disconnectResizeObserver();
  }
}

function focusEditableElement(element: HTMLElement): void {
  element.focus();
  const range = element.ownerDocument.createRange();
  range.selectNodeContents(element);
  const selection = element.ownerDocument.defaultView?.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}
