import { isContentOwnedElement } from '../../platform/dom-host';
import { isQuickEditTextElement } from './elements';
import { resolveQuickEditTextTarget } from './target';

export interface QuickEditRuntimeEventOptions {
  isEnabled: () => boolean;
  isDocumentModeEnabled: () => boolean;
  editingElementsSize: () => number;
  hideHoverOverlay: () => void;
  showHoverOverlay: (element: HTMLElement) => void;
  makeElementEditable: (element: HTMLElement) => void;
  finishEditing: (element: HTMLElement) => void;
  cancelEditing: (element: HTMLElement) => void;
  disableDocumentMode: () => void;
  disableRequested: () => void;
}

export function resolveQuickEditTarget(
  event: MouseEvent | FocusEvent,
  iframe?: HTMLIFrameElement
): HTMLElement | null {
  const editingTarget = resolveActiveQuickEditElement(event.target);
  if (editingTarget) return editingTarget;
  return resolveQuickEditTextTarget(event, iframe);
}

export function isQuickEditOwnedElement(target: HTMLElement): boolean {
  return target.classList.contains('sniptale-editing') || isContentOwnedElement(target);
}

export function resolveActiveQuickEditElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Node)) {
    return null;
  }

  const element =
    target.nodeType === Node.ELEMENT_NODE ? (target as HTMLElement) : target.parentElement;

  if (!element) {
    return null;
  }

  return element.classList.contains('sniptale-editing')
    ? element
    : element.closest<HTMLElement>('.sniptale-editing');
}

export function isQuickEditTextTarget(target: HTMLElement): boolean {
  return target.nodeType === Node.ELEMENT_NODE && isQuickEditTextElement(target);
}
