import { isContentOwnedElement, isContentOwnedPassiveChrome } from '../../../platform/dom-host';
import { resolveIframeEventElement, resolveIframePointTarget } from '../../../platform/frame';

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

function isHostBackdrop(element: Element): boolean {
  return element.matches(HOST_MODAL_BACKDROP_SELECTOR);
}

function isHostDialogElement(element: Element): boolean {
  return Boolean(element.closest(HOST_MODAL_DIALOG_SELECTOR));
}

function resolveUnderlyingElement(
  event: PointerLikeEvent,
  target: Element,
  options: { skipHostDialogs: boolean }
): Element | null {
  if (!hasClientPoint(event) || typeof target.ownerDocument.elementsFromPoint !== 'function') {
    return null;
  }

  const elements = target.ownerDocument.elementsFromPoint(event.clientX, event.clientY);
  return (
    elements.find(
      (element): element is Element =>
        element !== target &&
        !isHostBackdrop(element) &&
        (!options.skipHostDialogs || !isHostDialogElement(element)) &&
        !isContentOwnedElement(element)
    ) ?? null
  );
}

function resolveUnderlyingPageElement(
  event: PointerLikeEvent,
  target: Element,
  options: { skipHostDialogs: boolean }
): Element | null {
  const underlying = resolveUnderlyingElement(event, target, options);
  if (underlying instanceof HTMLIFrameElement && hasClientPoint(event)) {
    return resolveIframePointTarget(underlying, event.clientX, event.clientY);
  }
  return underlying;
}

export function resolvePagePreparationElement(
  event: Event,
  iframe?: HTMLIFrameElement,
  options: { passThroughPassiveChrome?: boolean } = {}
): Element | null {
  const target = resolveIframeEventElement(event, iframe);
  if (!target) {
    return null;
  }

  if (isContentOwnedElement(target)) {
    return options.passThroughPassiveChrome && isContentOwnedPassiveChrome(target)
      ? resolveUnderlyingPageElement(event, target, { skipHostDialogs: false })
      : target;
  }

  if (!isHostBackdrop(target)) {
    return target;
  }

  return resolveUnderlyingPageElement(event, target, { skipHostDialogs: true }) ?? target;
}

export function resolvePagePreparationTarget(
  event: Event,
  iframe?: HTMLIFrameElement
): HTMLElement | null {
  const target = resolvePagePreparationElement(event, iframe);
  return target?.namespaceURI === 'http://www.w3.org/1999/xhtml' ? (target as HTMLElement) : null;
}
