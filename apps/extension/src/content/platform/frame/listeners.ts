import { attachIframeDocumentTree } from './document-tree';
import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'iframe-utils', traceEnabled: true });

function createIframeEventLogger(prefix: string, iframe: HTMLIFrameElement): void {
  logger.log(prefix, iframe.id || iframe.src?.substring(0, 50));
}

type DynamicListenerRootOptions = {
  rootDocument?: Document | undefined;
  rootIframe?: HTMLIFrameElement | undefined;
};

function attachToAccessibleDocumentsDynamic(
  attach: (doc: Document, iframe?: HTMLIFrameElement) => (() => void) | undefined,
  rootOptions?: DynamicListenerRootOptions
): () => void {
  const cleanupFns: Array<() => void> = [];
  const trackedDocs = new WeakSet<Document>();
  const observedDocs = new WeakSet<Document>();
  const rootDocument = rootOptions?.rootDocument ?? document;

  const attachDocumentTree = (doc: Document, iframe?: HTMLIFrameElement): void => {
    if (trackedDocs.has(doc)) {
      return;
    }
    trackedDocs.add(doc);
    const cleanup = attach(doc, iframe);
    if (cleanup) {
      cleanupFns.push(cleanup);
    }
    attachIframeDocumentTree(doc, {
      cleanupFns,
      observedDocs,
      onIframeDocument: (nestedDoc, nestedIframe) => {
        if (!trackedDocs.has(nestedDoc)) {
          createIframeEventLogger('[iframe-utils] New iframe detected:', nestedIframe);
        }
        attachDocumentTree(nestedDoc, nestedIframe);
      },
      requireDocumentReady: true,
    });
  };

  attachDocumentTree(rootDocument, rootOptions?.rootIframe);

  return () => {
    logger.log('Cleaning up all event listeners');
    cleanupFns.forEach((cleanup) => cleanup());
  };
}

/**
 * Add event listener to all windows (top-level + iframes) with dynamic iframe support.
 */
export function addEventListenerToAllWindowsDynamic<E extends Event = Event>(
  eventType: string,
  handler: (event: E, iframe?: HTMLIFrameElement) => void,
  options?: AddEventListenerOptions,
  rootOptions?: DynamicListenerRootOptions
): () => void {
  return attachToAccessibleDocumentsDynamic((doc, iframe) => {
    const documentHandler = (event: Event) => handler(event as E, iframe);
    doc.addEventListener(eventType, documentHandler, options);
    if (iframe) {
      createIframeEventLogger(`[iframe-utils] Added ${eventType} listener to iframe:`, iframe);
    }
    return () => {
      try {
        doc.removeEventListener(eventType, documentHandler, options);
      } catch {
        // Cross-origin iframe navigation can invalidate the document before cleanup.
      }
    };
  }, rootOptions);
}

/** Adds a browser-window listener to every current and later accessible iframe parent context. */
export function addWindowEventListenerToAllWindowsDynamic<E extends Event = Event>(
  eventType: string,
  handler: (event: E, currentWindow: Window, iframe?: HTMLIFrameElement) => void,
  options?: AddEventListenerOptions,
  rootOptions?: DynamicListenerRootOptions
): () => void {
  return attachToAccessibleDocumentsDynamic((doc, iframe) => {
    const currentWindow = doc.defaultView;
    if (!currentWindow) {
      return undefined;
    }
    const windowHandler = (event: Event) => handler(event as E, currentWindow, iframe);
    currentWindow.addEventListener(eventType, windowHandler, options);
    return () => {
      try {
        currentWindow.removeEventListener(eventType, windowHandler, options);
      } catch {
        // Cross-origin iframe navigation can invalidate the window before cleanup.
      }
    };
  }, rootOptions);
}
