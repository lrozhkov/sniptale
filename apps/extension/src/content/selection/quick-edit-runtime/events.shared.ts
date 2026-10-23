import { isContentOwnedElement } from '../../platform/dom-host';
import { isQuickEditTextElement } from './elements';
import { resolveQuickEditTextTarget } from './target';
import { walkAllDocuments } from '../../platform/frame';

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
  const node = resolveQuickEditNode(target);
  if (!node) {
    return null;
  }

  const element = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;

  if (!element) {
    return null;
  }

  return element.classList.contains('sniptale-editing')
    ? element
    : element.closest<HTMLElement>('.sniptale-editing');
}

function resolveQuickEditNode(target: EventTarget | null): Node | null {
  if (target instanceof Node) return target;
  let resolved: Node | null = null;
  walkAllDocuments((currentDocument) => {
    const NodeConstructor = currentDocument.defaultView?.Node;
    if (NodeConstructor && target instanceof NodeConstructor) resolved = target;
  });
  return resolved;
}

export function isQuickEditTextTarget(target: HTMLElement): boolean {
  return target.nodeType === Node.ELEMENT_NODE && isQuickEditTextElement(target);
}
