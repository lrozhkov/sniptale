import { getContainingIframe } from '../../../../platform/frame';

export function shouldDropLinkedElement(linkedElement: HTMLElement): boolean {
  if (!linkedElement.isConnected) {
    return true;
  }

  const containingIframe = getContainingIframe(linkedElement);
  if (!containingIframe) {
    return false;
  }

  return containingIframe.contentDocument !== linkedElement.ownerDocument;
}
