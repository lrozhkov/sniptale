import { isContentOwnedElement } from '../../../platform/dom-host';
import { resolveIframeEventTarget } from '../../../platform/frame';

const HOST_MODAL_BACKDROP_SELECTOR = [
  '.b-lightbox-form__darkening',
  '.gwt-PopupPanelGlass',
  '.gwt-DialogBoxGlass',
].join(',');

const HOST_MODAL_DIALOG_SELECTOR = ['.gwt-DialogBox', '.b-lightbox-form', '[role="dialog"]'].join(
  ','
);

type PointerLikeEvent = Event & {
  clientX?: number;
  clientY?: number;
};

function hasClientPoint(event: PointerLikeEvent): event is PointerLikeEvent & {
  clientX: number;
  clientY: number;
} {
  return typeof event.clientX === 'number' && typeof event.clientY === 'number';
}

function isHostBackdrop(element: HTMLElement): boolean {
  return element.matches(HOST_MODAL_BACKDROP_SELECTOR);
}

function isHostDialogElement(element: HTMLElement): boolean {
  return Boolean(element.closest(HOST_MODAL_DIALOG_SELECTOR));
}

function resolveUnderlyingElement(
  event: PointerLikeEvent,
  target: HTMLElement
): HTMLElement | null {
  if (!hasClientPoint(event) || typeof target.ownerDocument.elementsFromPoint !== 'function') {
    return null;
  }

  const elements = target.ownerDocument.elementsFromPoint(event.clientX, event.clientY);
  return (
    elements.find(
      (element): element is HTMLElement =>
        element instanceof HTMLElement &&
        element !== target &&
        !isHostBackdrop(element) &&
        !isHostDialogElement(element) &&
        !isContentOwnedElement(element)
    ) ?? null
  );
}

export function resolvePagePreparationTarget(
  event: Event,
  iframe?: HTMLIFrameElement
): HTMLElement | null {
  const target = resolveIframeEventTarget(event, iframe);
  if (!target || isContentOwnedElement(target) || !isHostBackdrop(target)) {
    return target;
  }

  return resolveUnderlyingElement(event, target) ?? target;
}
