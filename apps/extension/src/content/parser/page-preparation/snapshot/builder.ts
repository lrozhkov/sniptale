import { waitForAccessibleIframeReady } from '../../../platform/frame';
import { buildVirtualDomSnapshot } from '../../dom-tree-parser/traversal';
import { appendStaticPagePreparationOverlays } from './overlays';
import {
  clearSelectedResponsiveCandidateMarks,
  markSelectedResponsiveCandidates,
  runWithoutSelectedResponsiveCandidateMarks,
} from './responsive-assets';
import { sanitizePreparedSnapshotDocument, serializePreparedSnapshotDocument } from './sanitizer';
import type {
  BuildPreparedSnapshotDocumentOptions,
  PreparedSnapshotDocumentResult,
  PreparedSnapshotWarning,
} from './types';
import { createIframeTimeoutWarning } from './warnings';
import { markPreparedSnapshotShadowStyles, materializePreparedSnapshotStyles } from './styles';
import { markPreparedSnapshotLiveState } from './live-state';
import { resolveContentShadowRoot } from '../../../platform/dom-host';
import type { VirtualDomOriginalElementResolver } from '../../dom-tree-parser/traversal';

function removeContentRuntimeHost(
  virtualRoot: HTMLElement,
  resolveOriginalElement: VirtualDomOriginalElementResolver
): void {
  const contentHost = resolveContentShadowRoot()?.host;
  if (!contentHost) return;
  for (const element of [virtualRoot, ...virtualRoot.querySelectorAll('*')]) {
    if (resolveOriginalElement(element) === contentHost) {
      element.remove();
      return;
    }
  }
}

function copyElementAttributes(target: Element, source: Element): void {
  for (const attribute of Array.from(target.attributes)) {
    target.removeAttribute(attribute.name);
  }

  for (const attribute of Array.from(source.attributes)) {
    target.setAttribute(attribute.name, attribute.value);
  }
}

function createSnapshotBody(
  snapshot: Document,
  sourceDocument: Document,
  virtualRoot: HTMLElement
) {
  const importedRoot = snapshot.importNode(virtualRoot, true);
  if (importedRoot instanceof HTMLBodyElement) {
    return importedRoot;
  }

  const body = snapshot.createElement('body');
  if (sourceDocument.body) {
    copyElementAttributes(body, sourceDocument.body);
  }
  body.appendChild(importedRoot);
  return body;
}

function createSnapshotDocument(sourceDocument: Document, virtualRoot: HTMLElement): Document {
  const snapshot = sourceDocument.implementation.createHTMLDocument(
    sourceDocument.title || 'Prepared snapshot'
  );
  copyElementAttributes(snapshot.documentElement, sourceDocument.documentElement);
  snapshot.head.replaceWith(snapshot.importNode(sourceDocument.head, true));
  snapshot.body.replaceWith(createSnapshotBody(snapshot, sourceDocument, virtualRoot));
  return snapshot;
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
  const liveStateMarks = markPreparedSnapshotLiveState(rootDocument);
  const shadowStyleMarks = markPreparedSnapshotShadowStyles(rootDocument);
  try {
    const iframeReadiness = await waitForAccessibleIframeReady(waitOptions);
    const virtualDomSnapshot = buildVirtualDomSnapshot({ documentRoot: rootDocument, root });
    removeContentRuntimeHost(virtualDomSnapshot.root, virtualDomSnapshot.resolveOriginalElement);
    const snapshot = createSnapshotDocument(rootDocument, virtualDomSnapshot.root);
    materializePreparedSnapshotStyles(rootDocument, snapshot);
    shadowStyleMarks.materialize(snapshot);
    const liveStateWarnings = liveStateMarks.materialize(snapshot);
    appendStaticPagePreparationOverlays(snapshot);

    const warnings = [
      ...createIframeReadinessWarnings(options, iframeReadiness.pendingIframes),
      ...liveStateWarnings,
      ...sanitizePreparedSnapshotDocument(snapshot, rootDocument.baseURI, {
        preserveAssetUrls: options.preserveAssetUrls === true,
      }),
    ];
    shadowStyleMarks.encapsulate(snapshot);
    const html = serializePreparedSnapshotHtml(snapshot);

    return { document: snapshot, html, warnings };
  } finally {
    shadowStyleMarks.cleanup();
    liveStateMarks.cleanup();
    clearSelectedResponsiveCandidateMarks(markedElements);
  }
}

export { serializePreparedSnapshotDocument };
