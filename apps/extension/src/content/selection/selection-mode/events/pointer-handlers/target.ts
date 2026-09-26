import type { FrozenSelectionFrame } from '../../types';
import { isSelectionModeExtensionUiElement } from '../../runtime/extension-ui';
import { getContentEventTargetElement } from '../../../../platform/dom-host';
import { resolveIframeEventTarget } from '../../../../platform/frame';
import { resolveShieldedPageElement } from '../../../page-element-target';

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
  iframe?: HTMLIFrameElement,
  frozenFrame?: FrozenSelectionFrame | null
): HTMLElement | null {
  if (frozenFrame) {
    const target = getContentEventTargetElement(event);
    if (
      target &&
      isSelectionModeExtensionUiElement(target) &&
      !target.classList.contains('sniptale-selection-frozen-frame')
    )
      return target;
    return frozenFrame.geometry.targetAt(event.clientX, event.clientY);
  }
  const shieldedTarget = resolveShieldedPageElement(event);
  const target =
    (shieldedTarget?.namespaceURI === 'http://www.w3.org/1999/xhtml'
      ? (shieldedTarget as HTMLElement)
      : null) ??
    resolveIframeEventTarget(event, iframe) ??
    getContentEventTargetElement(event);
  return target ? resolveLinkedPreviewImage(target, event) : null;
}
