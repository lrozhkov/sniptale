import { getContentEventTargetElement } from '../../../../platform/dom-host';
import { resolveIframeEventTarget } from '../../../../platform/frame';

function hasClientPoint(event: MouseEvent): boolean {
  return Number.isFinite(event.clientX) && Number.isFinite(event.clientY);
}

function containsPoint(rect: DOMRect, event: MouseEvent): boolean {
  return (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  );
}

function resolveLinkedPreviewImage(target: HTMLElement, event: MouseEvent): HTMLElement {
  if (target instanceof HTMLImageElement || !(target instanceof HTMLAnchorElement)) {
    return target;
  }

  if (!hasClientPoint(event)) {
    return target;
  }

  const image = Array.from(target.children).find(
    (candidate): candidate is HTMLImageElement =>
      candidate instanceof HTMLImageElement &&
      containsPoint(candidate.getBoundingClientRect(), event)
  );

  return image ?? target;
}

export function resolveSelectionModePointerTarget(
  event: MouseEvent,
  iframe?: HTMLIFrameElement
): HTMLElement | null {
  const target = resolveIframeEventTarget(event, iframe) ?? getContentEventTargetElement(event);
  return target ? resolveLinkedPreviewImage(target, event) : null;
}
