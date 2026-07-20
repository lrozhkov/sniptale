import { getAccessibleIframes, getIframeDocument, isIframeAccessible } from './core';
import { collectIframeElements, shouldIgnoreIframeMutation } from './discovery';

interface AttachIframeDocumentTreeOptions {
  cleanupFns: Array<() => void>;
  observedDocs: WeakSet<Document>;
  onIframeDocument: (doc: Document, iframe: HTMLIFrameElement) => void;
  requireDocumentReady?: boolean;
}

function isReadyForDocumentEvents(doc: Document): boolean {
  return doc.readyState === 'interactive' || doc.readyState === 'complete';
}

function connectIframeDocument(
  iframe: HTMLIFrameElement,
  { cleanupFns, onIframeDocument, requireDocumentReady = false }: AttachIframeDocumentTreeOptions
): void {
  const tryAttach = () => {
    if (!isIframeAccessible(iframe)) {
      return;
    }

    const iframeDoc = getIframeDocument(iframe);
    if (!iframeDoc) {
      return;
    }

    if (requireDocumentReady && !isReadyForDocumentEvents(iframeDoc)) {
      const handleReady = () => onIframeDocument(iframeDoc, iframe);
      iframeDoc.addEventListener('DOMContentLoaded', handleReady, { once: true });
      cleanupFns.push(() => {
        try {
          iframeDoc.removeEventListener('DOMContentLoaded', handleReady);
        } catch {
          // Cross-origin iframe navigation can invalidate the document before cleanup.
        }
      });
      return;
    }

    onIframeDocument(iframeDoc, iframe);
  };

  tryAttach();
  iframe.addEventListener('load', tryAttach, { once: true });
  cleanupFns.push(() => iframe.removeEventListener('load', tryAttach));
}

export function attachIframeDocumentTree(
  doc: Document,
  options: AttachIframeDocumentTreeOptions
): void {
  const { cleanupFns, observedDocs } = options;

  if (!observedDocs.has(doc) && doc.body) {
    observedDocs.add(doc);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement) || shouldIgnoreIframeMutation(node)) {
            continue;
          }

          collectIframeElements(node).forEach((iframe) => connectIframeDocument(iframe, options));
        }
      }
    });

    observer.observe(doc.body, { childList: true, subtree: true });
    cleanupFns.push(() => observer.disconnect());
  }

  getAccessibleIframes(doc).forEach((iframe) => connectIframeDocument(iframe, options));
}
