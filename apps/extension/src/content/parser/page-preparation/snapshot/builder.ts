import { waitForAccessibleIframeReady } from '../../../platform/frame';
import { appendStaticPagePreparationOverlays } from './overlays';
import {
  clearSelectedResponsiveCandidateMarks,
  markSelectedResponsiveCandidates,
  runWithoutSelectedResponsiveCandidateMarks,
} from './responsive-assets';
import {
  IFRAME_RASTER_RECT_ATTRIBUTES,
  clearPreparedSnapshotIframeRasterAttributes,
  sanitizePreparedSnapshotDocument,
  serializePreparedSnapshotDocument,
} from './sanitizer';
import type {
  BuildPreparedSnapshotDocumentOptions,
  PreparedSnapshotDocumentResult,
  PreparedSnapshotWarning,
} from './types';
import { createIframeTimeoutWarning } from './warnings';
import { markPreparedSnapshotShadowStyles, materializePreparedSnapshotStyles } from './styles';
import { capturePreparedSnapshotLiveState } from './live-state';
import { resolveContentShadowRoot } from '../../../platform/dom-host';
import type { VirtualDomOriginalElementResolver } from '../../dom-tree-parser/traversal';
import { buildInertPreparedSnapshotVirtualDom } from './inert-virtual-dom';
import {
  CONTENT_RUNTIME_HOST_ID,
  CONTENT_RUNTIME_MARKER_ATTRIBUTE,
} from '../../../runtime/entrypoint/markers';
import { resolvePageScrollRoot } from '../../../platform/page-scroll';
import type { FullPageCaptureRasterRegion } from '../../../../contracts/full-page-capture';
import { getAbsolutePosition } from '../../../platform/frame';
import { collectWebSnapshotQueryRoots } from '../../../../features/web-snapshot/public';
import { isAccessibleDocumentRuntimeStyle } from '../../../platform/frame';

function isIframeElement(node: Node | null): node is HTMLIFrameElement {
  return node?.nodeType === Node.ELEMENT_NODE && (node as Element).localName === 'iframe';
}

function resolveTopDocumentAnchor(source: Element, topDocument: Document): Element | null {
  let anchor = source;
  let depth = 0;
  while (anchor.ownerDocument !== topDocument && depth < 10) {
    depth += 1;
    const frameElement = anchor.ownerDocument.defaultView?.frameElement;
    if (!frameElement || frameElement.nodeType !== Node.ELEMENT_NODE) return null;
    anchor = frameElement;
  }
  return anchor.ownerDocument === topDocument ? anchor : null;
}

function resolveContentRuntimeHost(originalRoot: HTMLElement): Element | null {
  const registeredHost = resolveContentShadowRoot()?.host;
  if (registeredHost) return registeredHost;

  const candidates = [
    originalRoot,
    ...originalRoot.querySelectorAll(`#${CONTENT_RUNTIME_HOST_ID}`),
  ];
  return (
    candidates.find(
      (candidate) =>
        candidate.id === CONTENT_RUNTIME_HOST_ID &&
        candidate.hasAttribute(CONTENT_RUNTIME_MARKER_ATTRIBUTE) &&
        candidate.shadowRoot !== null
    ) ?? null
  );
}

function removeContentRuntimeHost(
  virtualRoot: HTMLElement,
  originalRoot: HTMLElement,
  resolveOriginalElement: VirtualDomOriginalElementResolver
): void {
  const contentHost = resolveContentRuntimeHost(originalRoot);
  if (!contentHost) return;
  for (const element of [virtualRoot, ...virtualRoot.querySelectorAll('*')]) {
    if (resolveOriginalElement(element) === contentHost) {
      element.remove();
      return;
    }
  }
}

function removeContentRuntimeStyles(
  snapshot: Document,
  resolveOriginalElement: VirtualDomOriginalElementResolver
): void {
  for (const root of collectWebSnapshotQueryRoots(snapshot)) {
    for (const style of root.querySelectorAll('style')) {
      const original = resolveOriginalElement(style);
      if (original && isAccessibleDocumentRuntimeStyle(original)) style.remove();
    }
  }
}

function markUnreadableIframeRasterGeometry(
  virtualRoot: HTMLElement,
  resolveOriginalElement: VirtualDomOriginalElementResolver,
  topDocument: Document
): void {
  const captureRoot = resolvePageScrollRoot();
  const virtualIframes = collectWebSnapshotQueryRoots(virtualRoot.ownerDocument).flatMap((root) =>
    Array.from(root.querySelectorAll('iframe'))
  );
  for (const virtualIframe of virtualIframes) {
    const source = resolveOriginalElement(virtualIframe);
    if (!isIframeElement(source)) continue;
    const rect = getAbsolutePosition(source, topDocument);
    const topDocumentAnchor = resolveTopDocumentAnchor(source, topDocument);
    if (!topDocumentAnchor) continue;
    let region: FullPageCaptureRasterRegion;
    if (captureRoot.kind === 'document') {
      const view = topDocument.defaultView;
      region = {
        coordinateSpace: 'document',
        height: rect.height,
        width: rect.width,
        x: rect.x + (view?.scrollX ?? 0),
        y: rect.y + (view?.scrollY ?? 0),
      };
    } else if (captureRoot.kind === 'viewport') {
      region = {
        coordinateSpace: 'viewport',
        height: rect.height,
        width: rect.width,
        x: rect.x,
        y: rect.y,
      };
    } else if (captureRoot.element.contains(topDocumentAnchor)) {
      const rootRect = captureRoot.element.getBoundingClientRect();
      region = {
        coordinateSpace: 'root-content',
        height: rect.height,
        width: rect.width,
        x:
          rect.x -
          (rootRect.left + captureRoot.element.clientLeft) +
          captureRoot.element.scrollLeft,
        y: rect.y - (rootRect.top + captureRoot.element.clientTop) + captureRoot.element.scrollTop,
      };
    } else {
      region = {
        coordinateSpace: 'viewport-shell',
        height: rect.height,
        width: rect.width,
        x: rect.x,
        y: rect.y,
      };
    }
    virtualIframe.setAttribute(
      IFRAME_RASTER_RECT_ATTRIBUTES.coordinateSpace,
      region.coordinateSpace
    );
    virtualIframe.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.x, String(region.x));
    virtualIframe.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.y, String(region.y));
    virtualIframe.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.width, String(region.width));
    virtualIframe.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.height, String(region.height));
  }
}

function serializePreparedSnapshotHtml(snapshot: Document): string {
  return runWithoutSelectedResponsiveCandidateMarks(snapshot, () =>
    serializePreparedSnapshotDocument(snapshot)
  );
}

function createIframeReadinessWarnings(
  options: BuildPreparedSnapshotDocumentOptions,
  pendingIframes: HTMLIFrameElement[]
): PreparedSnapshotWarning[] {
  const rootDocument = options.rootDocument ?? document;
  return pendingIframes.map((iframe) => createIframeTimeoutWarning(iframe, rootDocument.baseURI));
}

function throwIfPreparedSnapshotAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new Error('Prepared snapshot cancelled');
}

async function yieldPreparedSnapshot(signal?: AbortSignal): Promise<void> {
  throwIfPreparedSnapshotAborted(signal);
  await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
  throwIfPreparedSnapshotAborted(signal);
}

/**
 * Builds the canonical static prepared-page snapshot document.
 *
 * The source DOM remains authoritative: this function reads the prepared live DOM after quick-edit
 * and annotation mutations, flattens readable iframes through the virtual DOM pipeline, appends
 * static page-preparation overlays, and sanitizes the result into a no-script artifact.
 */
export async function buildPreparedSnapshotDocument(
  options: BuildPreparedSnapshotDocumentOptions = {}
): Promise<PreparedSnapshotDocumentResult> {
  const rootDocument = options.rootDocument ?? document;
  const root = options.root ?? rootDocument.body;
  const waitOptions = {
    contextLabel: options.contextLabel ?? 'prepared-snapshot',
    rootDocument,
    ...(options.iframeTimeoutMs === undefined ? {} : { timeoutMs: options.iframeTimeoutMs }),
  };
  const markedElements = markSelectedResponsiveCandidates(rootDocument);
  const shadowStyleMarks = markPreparedSnapshotShadowStyles(rootDocument);
  try {
    const iframeReadiness = await waitForAccessibleIframeReady(waitOptions);
    await yieldPreparedSnapshot(options.abortSignal);
    const virtualDomSnapshot = buildInertPreparedSnapshotVirtualDom(rootDocument, root);
    await yieldPreparedSnapshot(options.abortSignal);
    clearPreparedSnapshotIframeRasterAttributes(virtualDomSnapshot.document);
    removeContentRuntimeHost(
      virtualDomSnapshot.root,
      root,
      virtualDomSnapshot.resolveOriginalElement
    );
    removeContentRuntimeStyles(
      virtualDomSnapshot.document,
      virtualDomSnapshot.resolveOriginalElement
    );
    markUnreadableIframeRasterGeometry(
      virtualDomSnapshot.root,
      virtualDomSnapshot.resolveOriginalElement,
      rootDocument
    );
    const liveState = capturePreparedSnapshotLiveState(
      virtualDomSnapshot.root,
      virtualDomSnapshot.resolveOriginalElement
    );
    await yieldPreparedSnapshot(options.abortSignal);
    const snapshot = virtualDomSnapshot.document;
    materializePreparedSnapshotStyles(rootDocument, snapshot);
    const liveStateWarnings = liveState.materialize(virtualDomSnapshot.root);
    shadowStyleMarks.materialize(snapshot);
    appendStaticPagePreparationOverlays(snapshot, rootDocument);
    await yieldPreparedSnapshot(options.abortSignal);

    const warnings = [
      ...createIframeReadinessWarnings(options, iframeReadiness.pendingIframes),
      ...liveStateWarnings,
      ...sanitizePreparedSnapshotDocument(snapshot, rootDocument.baseURI, {
        preserveAssetUrls: options.preserveAssetUrls === true,
      }),
    ];
    await yieldPreparedSnapshot(options.abortSignal);
    shadowStyleMarks.encapsulate(snapshot);
    const html = options.serializeHtml === false ? '' : serializePreparedSnapshotHtml(snapshot);

    return { document: snapshot, html, warnings };
  } finally {
    shadowStyleMarks.cleanup();
    clearSelectedResponsiveCandidateMarks(markedElements);
  }
}

export { serializePreparedSnapshotDocument };
