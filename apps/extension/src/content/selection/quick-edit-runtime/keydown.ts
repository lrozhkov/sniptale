import type { QuickEditRuntimeEventOptions } from './events.shared';
import { isQuickEditOwnedElement, resolveActiveQuickEditElement } from './events.shared';
import { createLogger } from '@sniptale/platform/observability/logger';
import { resolveDocumentModeEditRoot } from './document-mode.targets';

const logger = createLogger({ namespace: 'ContentQuickEditKeydownBridge' });

function resolveQuickEditKeyboardTarget(event: KeyboardEvent): HTMLElement | null {
  const pathTarget = event.composedPath().find((target) => target instanceof HTMLElement);
  if (pathTarget instanceof HTMLElement) return pathTarget;
  const target = event.target;
  if (target instanceof HTMLElement) return target;
  return target instanceof Node ? target.parentElement : null;
}

export function handleQuickEditKeyDown(
  event: KeyboardEvent,
  options: QuickEditRuntimeEventOptions
): void {
  if (!options.isEnabled()) {
    return;
  }

  const activeElement = resolveEditingElement(event);
  const isManagedEditingTarget = activeElement?.classList.contains('sniptale-editing') === true;
  if (isManagedEditingTarget) {
    logger.log('Captured managed keydown', {
      connected: activeElement.isConnected,
      defaultPrevented: event.defaultPrevented,
    });
  }
  if (event.defaultPrevented && !isManagedEditingTarget && !options.isDocumentModeEnabled()) {
    const target = resolveQuickEditKeyboardTarget(event);
    if (event.key !== 'Escape' || !target || isQuickEditOwnedElement(target)) return;
  }

  if (activeElement && isManagedEditingTarget) {
    handleActiveQuickEditKeyDown(event, activeElement, options);
    return;
  }

  if (options.isDocumentModeEnabled()) {
    if (event.key === 'Escape') {
      event.preventDefault();
      stopManagedEditingPropagation(event);
      options.disableDocumentMode();
      return;
    }
    applyDocumentModeKeyDown(event);
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    stopManagedEditingPropagation(event);
    options.disableRequested();
  }
}

function createDocumentModeInputEvent(
  type: 'beforeinput' | 'input',
  inputType: string,
  data: string | null
): InputEvent {
  return new InputEvent(type, {
    bubbles: true,
    cancelable: false,
    composed: true,
    data,
    inputType,
  });
}

function resolveDocumentModeInput(event: KeyboardEvent): {
  data: string | null;
  inputType: string;
} | null {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.key.length === 1) return { data: event.key, inputType: 'insertText' };
  if (event.key === 'Enter') return { data: null, inputType: 'insertParagraph' };
  if (event.key === 'Backspace') return { data: null, inputType: 'deleteContentBackward' };
  if (event.key === 'Delete') return { data: null, inputType: 'deleteContentForward' };
  return null;
}

function extendCollapsedDeletionSelection(selection: Selection, inputType: string): void {
  if (!selection.isCollapsed || !selection.modify) return;
  selection.modify(
    'extend',
    inputType === 'deleteContentBackward' ? 'backward' : 'forward',
    'character'
  );
}

function applyDocumentModeMutation(
  selection: Selection,
  input: { data: string | null; inputType: string }
): void {
  if (input.inputType.startsWith('delete')) {
    extendCollapsedDeletionSelection(selection, input.inputType);
    if (selection.rangeCount > 0) selection.getRangeAt(0).deleteContents();
    return;
  }
  if (selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node =
    input.inputType === 'insertParagraph'
      ? range.startContainer.ownerDocument?.createElement('br')
      : range.startContainer.ownerDocument?.createTextNode(input.data ?? '');
  if (!node) return;
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function applyDocumentModeNavigation(event: KeyboardEvent, selection: Selection): boolean {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
    const root = resolveDocumentModeEditRoot(event.target);
    if (!root) return false;
    const range = root.ownerDocument.createRange();
    range.selectNodeContents(root);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }
  if (event.ctrlKey || event.metaKey || event.altKey || !selection.modify) return false;
  const movement = {
    ArrowDown: ['forward', 'line'],
    ArrowLeft: ['backward', 'character'],
    ArrowRight: ['forward', 'character'],
    ArrowUp: ['backward', 'line'],
    End: ['forward', 'lineboundary'],
    Home: ['backward', 'lineboundary'],
  }[event.key] as ['backward' | 'forward', 'character' | 'line' | 'lineboundary'] | undefined;
  if (!movement) return false;
  selection.modify(event.shiftKey ? 'extend' : 'move', movement[0], movement[1]);
  return true;
}

function applyDocumentModeKeyDown(event: KeyboardEvent): void {
  const root = resolveDocumentModeEditRoot(event.target);
  const selection = root?.ownerDocument.getSelection();
  if (!root || !selection) return;
  if (applyDocumentModeNavigation(event, selection)) {
    event.preventDefault();
    stopManagedEditingPropagation(event);
    return;
  }
  const input = resolveDocumentModeInput(event);
  if (!input) return;
  event.preventDefault();
  stopManagedEditingPropagation(event);
  root.dispatchEvent(createDocumentModeInputEvent('beforeinput', input.inputType, input.data));
  applyDocumentModeMutation(selection, input);
  root.dispatchEvent(createDocumentModeInputEvent('input', input.inputType, input.data));
  logger.log('Applied document-mode edit', {
    inputType: input.inputType,
    textLength: root.textContent?.length ?? 0,
  });
}

function handleActiveQuickEditKeyDown(
  event: KeyboardEvent,
  activeElement: HTMLElement,
  options: QuickEditRuntimeEventOptions
): void {
  if (stopNavigationKeys(event, activeElement)) {
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
    return;
  }

  if (event.key === 'Backspace' || event.key === 'Delete') {
    event.preventDefault();
    deleteFromEditableElement(activeElement, event.key === 'Backspace' ? 'backward' : 'forward');
    activeElement.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    stopManagedEditingPropagation(event);
    return;
  }

  if (
    event.key.length === 1 &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.isComposing
  ) {
    event.preventDefault();
    const text =
      event.key === ' ' && !hasMeaningfulContentToRightAtSelection(activeElement)
        ? '\u00A0'
        : event.key;
    insertTextIntoEditableElement(activeElement, text);
    activeElement.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    logger.log('Applied managed edit', {
      connected: activeElement.isConnected,
      textLength: activeElement.textContent?.length ?? 0,
    });
    stopManagedEditingPropagation(event);
  }
}

function deleteFromEditableElement(element: HTMLElement, direction: 'backward' | 'forward'): void {
  const selection = element.ownerDocument.getSelection();
  let range = resolveEditableSelectionRange(element, selection);
  if (!selection || !range) return;
  if (range.collapsed) {
    if (range.startContainer instanceof Text) {
      const offset = range.startOffset;
      if (direction === 'backward' && offset > 0) {
        range.setStart(range.startContainer, offset - 1);
      } else if (direction === 'forward' && offset < range.startContainer.length) {
        range.setEnd(range.startContainer, offset + 1);
      } else if (selection.modify) {
        selection.modify('extend', direction, 'character');
        if (selection.rangeCount > 0) range = selection.getRangeAt(0);
      }
    } else if (selection.modify) {
      selection.modify('extend', direction, 'character');
      if (selection.rangeCount > 0) range = selection.getRangeAt(0);
    }
  }
  range.deleteContents();
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
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

function hasMeaningfulContentToRightAtSelection(element: HTMLElement): boolean {
  const selection = element.ownerDocument.getSelection();
  const range = resolveEditableSelectionRange(element, selection);
  return range ? hasMeaningfulContentToRight(element, range) : false;
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

function stopNavigationKeys(event: KeyboardEvent, activeElement: HTMLElement): boolean {
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

  const selection = activeElement.ownerDocument.getSelection() as
    | (Selection & {
        modify?: (
          alteration: 'extend' | 'move',
          direction: 'backward' | 'forward',
          granularity: 'character' | 'line' | 'lineboundary' | 'page'
        ) => void;
      })
    | null;
  const movement = {
    ArrowDown: ['forward', 'line'],
    ArrowLeft: ['backward', 'character'],
    ArrowRight: ['forward', 'character'],
    ArrowUp: ['backward', 'line'],
    End: ['forward', 'lineboundary'],
    Home: ['backward', 'lineboundary'],
    PageDown: ['forward', 'page'],
    PageUp: ['backward', 'page'],
  }[event.key] as
    | ['backward' | 'forward', 'character' | 'line' | 'lineboundary' | 'page']
    | undefined;
  if (selection?.modify && movement) {
    event.preventDefault();
    selection.modify(event.shiftKey ? 'extend' : 'move', movement[0], movement[1]);
  }
  stopManagedEditingPropagation(event);
  return true;
}
