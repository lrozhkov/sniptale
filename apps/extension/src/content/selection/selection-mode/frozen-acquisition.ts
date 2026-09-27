import { isContentOwnedElement } from '../../platform/dom-host';
import { getAbsolutePosition, getIframeDocument } from '../../platform/frame';
import { captureFrozenSelectionGeometry } from './frozen';
import type { FrozenSelectionFrame, FrozenSelectionGeometry } from './types';

export class SelectionFrameChangedError extends Error {
  constructor() {
    super('Page changed while acquiring selection frame');
    this.name = 'SelectionFrameChangedError';
  }
}

function geometrySignature(element: Element, rect = getAbsolutePosition(element)): string {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return JSON.stringify([
    rect,
    style?.display,
    style?.visibility,
    style?.opacity,
    style?.pointerEvents,
    style?.zIndex,
    style?.transform,
    style?.clipPath,
    style?.overflow,
    style?.color,
    style?.backgroundColor,
    style?.backgroundImage,
    style?.borderRadius,
    style?.font,
    style?.boxShadow,
    style?.filter,
  ]);
}

function generatedContentSignature(element: Element): string {
  const view = element.ownerDocument.defaultView;
  const style = (pseudo: '::before' | '::after') => {
    const value = view?.getComputedStyle(element, pseudo);
    return [
      value?.content,
      value?.display,
      value?.visibility,
      value?.opacity,
      value?.color,
      value?.backgroundColor,
      value?.backgroundImage,
      value?.font,
      value?.transform,
    ];
  };
  return JSON.stringify([style('::before'), style('::after')]);
}

function isVisibleInViewport(element: Element): boolean {
  const rect = getAbsolutePosition(element);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.x < window.innerWidth &&
    rect.y < window.innerHeight &&
    rect.x + rect.width > 0 &&
    rect.y + rect.height > 0
  );
}

function isMetadataAttributeChange(record: MutationRecord): boolean {
  return (
    record.type === 'attributes' &&
    !isContentOwnedElement(record.target) &&
    (record.attributeName === 'title' || record.attributeName?.startsWith('aria-') === true)
  );
}

function hasUncertainPageMutation(records: MutationRecord[]): boolean {
  return records.some(
    (record) => !isContentOwnedElement(record.target) && !isMetadataAttributeChange(record)
  );
}

function isIframe(element: Element): element is HTMLIFrameElement {
  return element.localName === 'iframe' && element.namespaceURI === 'http://www.w3.org/1999/xhtml';
}

function observePageDuringAcquisition() {
  const signatures = new Map<Element, string>();
  const generatedContent = new Map<Element, string>();
  const initiallyNotVisible = new Set<Element>();
  const roots = new Set<Document | ShadowRoot>();
  const windows = new Set<Window>();
  let changed = false;
  let metadataChanged = false;
  const canReadGeneratedContent = globalThis.CSS?.supports?.('selector(::before)') === true;
  const markChanged = () => {
    changed = true;
  };
  const noteMetadata = (records: MutationRecord[]) => {
    if (records.some(isMetadataAttributeChange)) metadataChanged = true;
  };
  const observer = new MutationObserver((records) => {
    noteMetadata(records);
    if (hasUncertainPageMutation(records)) markChanged();
  });
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
      if (isVisibleInViewport(element)) {
        signatures.set(element, geometrySignature(element));
        if (canReadGeneratedContent) {
          generatedContent.set(element, generatedContentSignature(element));
        }
      } else initiallyNotVisible.add(element);
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
    generatedContent.clear();
    initiallyNotVisible.clear();
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
      const records = observer.takeRecords();
      noteMetadata(records);
      if (
        changed ||
        hasUncertainPageMutation(records) ||
        [...signatures].some(
          ([element, signature]) => !element.isConnected || geometrySignature(element) !== signature
        ) ||
        (metadataChanged &&
          [...initiallyNotVisible].some(
            (element) => element.isConnected && isVisibleInViewport(element)
          )) ||
        (metadataChanged &&
          [...generatedContent].some(
            ([element, signature]) => generatedContentSignature(element) !== signature
          ))
      ) {
        throw new SelectionFrameChangedError();
      }
    },
  };
}

function areaOnlyGeometry(geometry: FrozenSelectionGeometry): FrozenSelectionGeometry {
  return {
    width: geometry.width,
    height: geometry.height,
    scale: geometry.scale,
    assertViewport: geometry.assertViewport,
    getRect: () => ({ x: 0, y: 0, width: 0, height: 0 }),
    targetAt: () => null,
  };
}

/** Acquires one raster/geometry pair, optionally keeping its raster for manual area selection. */
export async function acquireFrozenSelectionFrame(
  capture: () => Promise<string>,
  options: { onChanged?: 'area-only' } = {}
): Promise<FrozenSelectionFrame> {
  const observation = observePageDuringAcquisition();
  try {
    const geometry = captureFrozenSelectionGeometry();
    const dataUrl = await capture();
    try {
      observation.assertStable();
    } catch (error) {
      if (!(error instanceof SelectionFrameChangedError) || options.onChanged !== 'area-only') {
        throw error;
      }
      geometry.assertViewport();
      return { areaOnly: true, dataUrl, geometry: areaOnlyGeometry(geometry) };
    }
    geometry.assertViewport();
    if (geometry.areaOnly) {
      return { areaOnly: true, dataUrl, geometry: areaOnlyGeometry(geometry) };
    }
    return { dataUrl, geometry };
  } finally {
    observation.dispose();
  }
}
