import { isIframeAccessible } from '../../../../platform/frame';

export function observeIframeInsertions(addIframeListeners: (iframeEl: HTMLIFrameElement) => void) {
  const iframeObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) {
          continue;
        }
        if (node.closest?.('.sniptale-frames-container, .sniptale-focus-overlay, .sniptale-app')) {
          continue;
        }
        registerIframeNode(node, addIframeListeners);
      }
    }
  });

  iframeObserver.observe(document.body, {
    childList: true,
    subtree: false,
  });

  return iframeObserver;
}

function registerIframeNode(
  node: HTMLElement,
  addIframeListeners: (iframeEl: HTMLIFrameElement) => void
) {
  if (node instanceof HTMLIFrameElement) {
    if (isIframeAccessible(node)) {
      addIframeListeners(node);
    }
    return;
  }

  node.querySelectorAll('iframe').forEach((child) => {
    if (child instanceof HTMLIFrameElement && isIframeAccessible(child)) {
      addIframeListeners(child);
    }
  });
}
