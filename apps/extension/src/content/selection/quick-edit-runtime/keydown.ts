import type { QuickEditRuntimeEventOptions } from './events.shared';
import { resolveActiveQuickEditElement } from './events.shared';

export function handleQuickEditKeyDown(
  event: KeyboardEvent,
  options: QuickEditRuntimeEventOptions
): void {
  if (!options.isEnabled()) {
    return;
  }

  if (options.isDocumentModeEnabled()) {
    if (event.key === 'Escape') {
      event.preventDefault();
      stopManagedEditingPropagation(event);
      options.disableDocumentMode();
    }
    return;
  }

  const activeElement = resolveEditingElement(event);

  if (activeElement?.classList.contains('sniptale-editing')) {
    handleActiveQuickEditKeyDown(event, activeElement, options);
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    stopManagedEditingPropagation(event);
    options.disableRequested();
  }
}

function handleActiveQuickEditKeyDown(
  event: KeyboardEvent,
  activeElement: HTMLElement,
  options: QuickEditRuntimeEventOptions
): void {
  if (stopNavigationKeys(event)) {
    return;
  }

  if (event.key === ' ') {
    stopManagedEditingPropagation(event);
    insertTrailingSpaceIfNeeded(event, activeElement);
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    stopManagedEditingPropagation(event);
    options.cancelEditing(activeElement);
    return;
  }

  if (event.key === 'Enter' && !event.ctrlKey && !event.shiftKey) {
    event.preventDefault();
    stopManagedEditingPropagation(event);
    options.finishEditing(activeElement);
    return;
  }

  if (event.key === 'Enter' && (event.ctrlKey || event.shiftKey)) {
    stopManagedEditingPropagation(event);
  }
}

function insertTextIntoEditableElement(element: HTMLElement, text: string): void {
  const selection = element.ownerDocument.getSelection();
  const range = resolveEditableSelectionRange(element, selection);
  if (!selection || !range) {
    return;
  }

  range.deleteContents();
  const textNode = element.ownerDocument.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.setEndAfter(textNode);
  selection.removeAllRanges();
  selection.addRange(range);
}

function insertTrailingSpaceIfNeeded(event: KeyboardEvent, element: HTMLElement): void {
  const selection = element.ownerDocument.getSelection();
  const range = resolveEditableSelectionRange(element, selection);
  if (!range || hasMeaningfulContentToRight(element, range)) {
    return;
  }

  event.preventDefault();
  insertTextIntoEditableElement(element, '\u00A0');
}

function resolveEditableSelectionRange(
  element: HTMLElement,
  selection: Selection | null
): Range | null {
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    if (element.contains(range.commonAncestorContainer)) {
      return range;
    }
  }

  const fallbackRange = element.ownerDocument.createRange();
  fallbackRange.selectNodeContents(element);
  fallbackRange.collapse(false);
  return fallbackRange;
}

function hasMeaningfulContentToRight(element: HTMLElement, range: Range): boolean {
  const tailRange = element.ownerDocument.createRange();
  tailRange.selectNodeContents(element);
  tailRange.setStart(range.endContainer, range.endOffset);
  const remainingText = tailRange.cloneContents().textContent ?? '';
  return remainingText.replace(/[\u00A0\u200B]/g, '').trim().length > 0;
}

function resolveEditingElement(event: KeyboardEvent): HTMLElement | null {
  const targetElement = resolveActiveQuickEditElement(event.target);
  if (targetElement) {
    return targetElement;
  }

  const eventDocument = (event.target as Node | null)?.ownerDocument ?? document;
  const activeElement = resolveActiveQuickEditElement(eventDocument.activeElement);
  if (activeElement) {
    return activeElement;
  }

  return resolveActiveQuickEditElement(eventDocument.getSelection()?.anchorNode ?? null);
}

function stopManagedEditingPropagation(event: KeyboardEvent): void {
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function stopNavigationKeys(event: KeyboardEvent): boolean {
  if (
    ![
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Home',
      'End',
      'PageUp',
      'PageDown',
    ].includes(event.key)
  ) {
    return false;
  }

  stopManagedEditingPropagation(event);
  return true;
}
