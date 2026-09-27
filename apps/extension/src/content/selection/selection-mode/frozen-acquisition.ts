import { isContentOwnedElement } from '../../platform/dom-host';
import { getAbsolutePosition, getIframeDocument } from '../../platform/frame';
import { captureFrozenSelectionGeometry } from './frozen';
import type { FrozenSelectionFrame, FrozenSelectionGeometry } from './types';
import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'ContentSelectionMode:Acquisition' });
type ChangeReason =
  | 'host-attributes'
  | 'host-child-list'
  | 'host-text'
  | 'scroll-or-resize'
  | 'visible-layout-or-style'
  | 'newly-visible-element'
  | 'generated-content';

function rejectChangedFrame(reason: ChangeReason): never {
  logger.warn('Frozen selection fallback', { diagnosticsVersion: 1, reason });
  throw new SelectionFrameChangedError();
}

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

function pageMutationReason(records: MutationRecord[]): ChangeReason | undefined {
  const record = records.find(
    (record) => !isContentOwnedElement(record.target) && !isMetadataAttributeChange(record)
  );
  if (record?.type === 'attributes') return 'host-attributes';
  if (record?.type === 'childList') return 'host-child-list';
  if (record?.type === 'characterData') return 'host-text';
  return undefined;
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
  const pausedAnimations = new Set<Animation>();
  let changeReason: ChangeReason | undefined;
  let metadataChanged = false;
  const canReadGeneratedContent = globalThis.CSS?.supports?.('selector(::before)') === true;
  const markChanged = () => {
    changeReason ??= 'scroll-or-resize';
  };
  const noteMetadata = (records: MutationRecord[]) => {
    if (records.some(isMetadataAttributeChange)) metadataChanged = true;
  };
  const observer = new MutationObserver((records) => {
    noteMetadata(records);
    changeReason ??= pageMutationReason(records);
  });
  const pauseAnimations = (root: Document | ShadowRoot) => {
    if (!('getAnimations' in root)) return;
    for (const animation of root.getAnimations()) {
      const effect = animation.effect;
      const target = effect && 'target' in effect ? effect.target : null;
      if (
        animation.playState !== 'running' ||
        (target instanceof Element && isContentOwnedElement(target)) ||
        pausedAnimations.has(animation)
      ) {
        continue;
      }
      const currentTime = animation.currentTime;
      animation.pause();
      pausedAnimations.add(animation);
      // Seeking settles the pending pause before geometry reads can observe another frame.
      if (currentTime !== null) animation.currentTime = currentTime;
    }
  };
  const collect = (root: Document | ShadowRoot, depth = 0) => {
    if (depth > 12 || roots.has(root)) return;
    roots.add(root);
    pauseAnimations(root);
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
    for (const animation of pausedAnimations) {
      if (animation.playState === 'paused') animation.play();
    }
    pausedAnimations.clear();
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
      changeReason ??= pageMutationReason(records);
      if (changeReason) rejectChangedFrame(changeReason);
      if (
        [...signatures].some(
          ([element, signature]) => !element.isConnected || geometrySignature(element) !== signature
        )
      )
        rejectChangedFrame('visible-layout-or-style');
      if (
        metadataChanged &&
        [...initiallyNotVisible].some(
          (element) => element.isConnected && isVisibleInViewport(element)
        )
      )
        rejectChangedFrame('newly-visible-element');
      if (
        metadataChanged &&
        [...generatedContent].some(
          ([element, signature]) => generatedContentSignature(element) !== signature
        )
      ) {
        rejectChangedFrame('generated-content');
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
  logger.info('Frozen selection acquisition', {
    diagnosticsVersion: 1,
    pixelRatio: window.devicePixelRatio || 1,
    viewportWidth: Math.min(32_768, Math.max(0, Math.round(window.innerWidth))),
    viewportHeight: Math.min(32_768, Math.max(0, Math.round(window.innerHeight))),
  });
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
      logger.warn('Frozen selection fallback', {
        diagnosticsVersion: 1,
        reason: 'geometry-budget',
      });
      return { areaOnly: true, dataUrl, geometry: areaOnlyGeometry(geometry) };
    }
    return { dataUrl, geometry };
  } finally {
    observation.dispose();
  }
}
