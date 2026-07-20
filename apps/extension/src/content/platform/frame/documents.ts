import { getAccessibleIframes, getIframeDocument, isIframeAccessible } from './core';
import { collectIframeElements, shouldIgnoreIframeMutation } from './discovery';
import { createLogger } from '@sniptale/platform/observability/logger';

type AccessibleDocumentStyleParams = {
  styleId: string;
  textContent: string;
};

const logger = createLogger({ namespace: 'FrameIframeDiag', traceEnabled: true });

function isReadyToApplyStyle(doc: Document): boolean {
  return doc.readyState === 'interactive' || doc.readyState === 'complete';
}

function mountStyleInDocument(doc: Document, params: AccessibleDocumentStyleParams): void {
  if (!doc.head || doc.getElementById(params.styleId)) {
    return;
  }

  const style = doc.createElement('style');
  style.id = params.styleId;
  style.textContent = params.textContent;
  doc.head.appendChild(style);
  logger.debug('mountStyleInDocument', {
    styleId: params.styleId,
    url: doc.defaultView?.location?.href,
  });
}

function unmountStyleInDocument(doc: Document, styleId: string): void {
  doc.getElementById(styleId)?.remove();
}

function registerCleanup(cleanupFns: Array<() => void>, cleanup: () => void): void {
  cleanupFns.push(cleanup);
}

function createIframeDocumentSetupScheduler(params: {
  applyToDocument: (doc: Document) => void;
  cleanupFns: Array<() => void>;
}) {
  return (iframe: HTMLIFrameElement): void => {
    const tryApply = () => {
      if (!isIframeAccessible(iframe)) {
        return;
      }

      const iframeDoc = getIframeDocument(iframe);
      if (!iframeDoc) {
        return;
      }

      params.applyToDocument(iframeDoc);
    };

    if (isIframeAccessible(iframe)) {
      const iframeDoc = getIframeDocument(iframe);
      if (iframeDoc && isReadyToApplyStyle(iframeDoc)) {
        tryApply();
      } else if (iframeDoc) {
        registerIframeReadyListener(iframeDoc, params.cleanupFns, tryApply);
      }
    }

    registerCleanup(params.cleanupFns, () => {
      iframe.removeEventListener('load', tryApply);
    });
    iframe.addEventListener('load', tryApply);
  };
}

function registerIframeReadyListener(
  iframeDoc: Document,
  cleanupFns: Array<() => void>,
  onReady: () => void
): void {
  iframeDoc.addEventListener('DOMContentLoaded', onReady, { once: true });
  registerCleanup(cleanupFns, () => {
    try {
      iframeDoc.removeEventListener('DOMContentLoaded', onReady);
    } catch {
      // Cross-origin navigation can invalidate the document before cleanup.
    }
  });
}

function createDocumentObserver(params: {
  cleanupFns: Array<() => void>;
  observedDocs: WeakSet<Document>;
  scheduleIframeDocumentSetup: (iframe: HTMLIFrameElement) => void;
}) {
  return (doc: Document): void => {
    if (params.observedDocs.has(doc) || !doc.body) {
      return;
    }

    params.observedDocs.add(doc);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const addedNode of mutation.addedNodes) {
          if (!(addedNode instanceof HTMLElement) || shouldIgnoreIframeMutation(addedNode)) {
            continue;
          }

          collectIframeElements(addedNode).forEach(params.scheduleIframeDocumentSetup);
        }
      }
    });

    observer.observe(doc.body, { childList: true, subtree: true });
    registerCleanup(params.cleanupFns, () => observer.disconnect());
  };
}

function createDocumentApplier(params: {
  cleanupFns: Array<() => void>;
  mountedDocs: Set<Document>;
  observeDocument: (doc: Document) => void;
  scheduleIframeDocumentSetup: (iframe: HTMLIFrameElement) => void;
  styleParams: AccessibleDocumentStyleParams;
}) {
  return (doc: Document): void => {
    if (params.mountedDocs.has(doc)) {
      return;
    }

    params.mountedDocs.add(doc);
    mountStyleInDocument(doc, params.styleParams);
    params.observeDocument(doc);

    getAccessibleIframes(doc).forEach(params.scheduleIframeDocumentSetup);
  };
}

/**
 * Mounts the same style element into the top document and all accessible same-origin iframe
 * documents, and keeps newly inserted iframe documents in sync while the cleanup handle is active.
 */
export function mountStyleInAccessibleDocuments(params: AccessibleDocumentStyleParams): () => void {
  const mountedDocs = new Set<Document>();
  const observedDocs = new WeakSet<Document>();
  const cleanupFns: Array<() => void> = [];
  let applyToDocument = (_doc: Document): void => {};
  const scheduleIframeDocumentSetup = createIframeDocumentSetupScheduler({
    applyToDocument: (doc) => applyToDocument(doc),
    cleanupFns,
  });
  const observeDocument = createDocumentObserver({
    cleanupFns,
    observedDocs,
    scheduleIframeDocumentSetup,
  });
  applyToDocument = createDocumentApplier({
    cleanupFns,
    mountedDocs,
    observeDocument,
    scheduleIframeDocumentSetup,
    styleParams: params,
  });

  applyToDocument(document);

  return () => {
    cleanupFns.forEach((cleanup) => cleanup());
    mountedDocs.forEach((doc) => {
      unmountStyleInDocument(doc, params.styleId);
    });
  };
}
