import { isContentOwnedElement } from '../../platform/dom-host';
import { resolvePagePreparationTarget } from '../../parser/page-preparation/target';
import { isQuickEditStyleInspectableElement, isQuickEditTextElement } from './elements';

export interface QuickEditRuntimeEventOptions {
  isEnabled: () => boolean;
  isDocumentModeEnabled: () => boolean;
  editingElementsSize: () => number;
  hideHoverOverlay: () => void;
  isStyleInspectorModeEnabled: () => boolean;
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
  return resolvePagePreparationTarget(event, iframe);
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

export function isQuickEditStyleInspectableTarget(target: HTMLElement): boolean {
  return target.nodeType === Node.ELEMENT_NODE && isQuickEditStyleInspectableElement(target);
}
