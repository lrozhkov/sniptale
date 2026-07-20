import { getAbsolutePosition, getContainingIframe } from '../../../platform/frame';

export function getFrameIframeDiagnostics(linkedElement?: HTMLElement) {
  if (!linkedElement) {
    return null;
  }

  const containingIframe = getContainingIframe(linkedElement);
  if (!containingIframe) {
    return null;
  }

  const absoluteRect = getAbsolutePosition(linkedElement);
  const localRect = linkedElement.getBoundingClientRect();
  const iframeRect = containingIframe.getBoundingClientRect();

  return {
    absoluteRect,
    iframeId: containingIframe.id || containingIframe.src,
    iframeRect: {
      left: iframeRect.left,
      top: iframeRect.top,
      width: iframeRect.width,
      height: iframeRect.height,
    },
    localRect: {
      left: localRect.left,
      top: localRect.top,
      width: localRect.width,
      height: localRect.height,
    },
  };
}
