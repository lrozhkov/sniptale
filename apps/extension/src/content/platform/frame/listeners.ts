import { attachIframeDocumentTree } from './document-tree';
import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'iframe-utils', traceEnabled: true });

function createIframeEventLogger(prefix: string, iframe: HTMLIFrameElement): void {
  logger.log(prefix, iframe.id || iframe.src?.substring(0, 50));
}

function addDocumentListener<E extends Event>(
  doc: Document,
  eventType: string,
  handler: (event: E, iframe?: HTMLIFrameElement) => void,
  options: AddEventListenerOptions | undefined,
  cleanupFns: Array<() => void>,
  trackedDocs: WeakSet<Document>,
  iframe?: HTMLIFrameElement
): void {
  if (trackedDocs.has(doc)) {
    return;
  }

  const documentHandler = (event: Event) => handler(event as E, iframe);
  doc.addEventListener(eventType, documentHandler, options);
  trackedDocs.add(doc);

  if (iframe) {
    createIframeEventLogger(`[iframe-utils] Added ${eventType} listener to iframe:`, iframe);
  }

  cleanupFns.push(() => {
    try {
      doc.removeEventListener(eventType, documentHandler, options);
    } catch {
      // Cross-origin iframe navigation can invalidate the document before cleanup.
    }
  });
}

type DynamicListenerRootOptions = {
  rootDocument?: Document | undefined;
  rootIframe?: HTMLIFrameElement | undefined;
};

/**
 * Add event listener to all windows (top-level + iframes) with dynamic iframe support.
 */
export function addEventListenerToAllWindowsDynamic<E extends Event = Event>(
  eventType: string,
  handler: (event: E, iframe?: HTMLIFrameElement) => void,
  options?: AddEventListenerOptions,
  rootOptions?: DynamicListenerRootOptions
): () => void {
  const cleanupFns: Array<() => void> = [];
  const trackedDocs = new WeakSet<Document>();
  const observedDocs = new WeakSet<Document>();
  const rootDocument = rootOptions?.rootDocument ?? document;

  let attachDocumentTree = (_doc: Document, _iframe?: HTMLIFrameElement): void => {};

  attachDocumentTree = (doc: Document, iframe?: HTMLIFrameElement): void => {
    addDocumentListener(doc, eventType, handler, options, cleanupFns, trackedDocs, iframe);
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
