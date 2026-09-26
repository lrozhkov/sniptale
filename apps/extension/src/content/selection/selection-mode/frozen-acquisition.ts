import { isContentOwnedElement } from '../../platform/dom-host';
import { getAbsolutePosition, getIframeDocument } from '../../platform/frame';
import { captureFrozenSelectionGeometry } from './frozen';
import type { FrozenSelectionFrame } from './types';

function geometrySignature(element: Element): string {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return JSON.stringify([
    getAbsolutePosition(element),
    style?.display,
    style?.visibility,
    style?.opacity,
    style?.pointerEvents,
    style?.zIndex,
    style?.transform,
    style?.clipPath,
    style?.overflow,
  ]);
}

function isIframe(element: Element): element is HTMLIFrameElement {
  return element.localName === 'iframe' && element.namespaceURI === 'http://www.w3.org/1999/xhtml';
}

function observePageDuringAcquisition() {
  const signatures = new Map<Element, string>();
  const roots = new Set<Document | ShadowRoot>();
  const windows = new Set<Window>();
  let changed = false;
  const markChanged = () => {
    changed = true;
  };
  const observer = new MutationObserver(markChanged);
  const collect = (root: Document | ShadowRoot, depth = 0) => {
    if (depth > 12 || roots.has(root)) return;
    roots.add(root);
    observer.observe(root, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
    });
    for (const element of root.querySelectorAll('*')) {
      if (isContentOwnedElement(element)) continue;
      signatures.set(element, geometrySignature(element));
      const view = element.ownerDocument.defaultView;
      if (view) windows.add(view);
      if (element.shadowRoot) collect(element.shadowRoot, depth + 1);
      if (isIframe(element)) {
        const nested = getIframeDocument(element);
        if (nested) collect(nested, depth + 1);
      }
    }
  };
  const dispose = () => {
    observer.disconnect();
    for (const view of windows) {
      view.removeEventListener('scroll', markChanged, true);
      view.removeEventListener('resize', markChanged);
    }
    signatures.clear();
    roots.clear();
    windows.clear();
  };
  try {
    collect(document);
    for (const view of windows) {
      view.addEventListener('scroll', markChanged, true);
      view.addEventListener('resize', markChanged);
    }
  } catch (error) {
    dispose();
    throw error;
  }
  return {
    dispose,
    assertStable: () => {
      if (
        changed ||
        observer.takeRecords().length > 0 ||
        [...signatures].some(
          ([element, signature]) => !element.isConnected || geometrySignature(element) !== signature
        )
      ) {
        throw new Error('Page changed while acquiring selection frame');
      }
    },
  };
}

/** Acquires one raster/geometry pair, rejecting changes during the asynchronous capture interval. */
export async function acquireFrozenSelectionFrame(
  capture: () => Promise<string>
): Promise<FrozenSelectionFrame> {
  const observation = observePageDuringAcquisition();
  try {
    const geometry = captureFrozenSelectionGeometry();
    const dataUrl = await capture();
    observation.assertStable();
    geometry.assertViewport();
    return { dataUrl, geometry };
  } finally {
    observation.dispose();
  }
}
