import { getIframeDocument, isIframeAccessible } from '../../../platform/frame';

export function createIframeSignalRegistry(args: {
  invalidate(): void;
  registerDocument(doc: Document): void;
  unregisterDocument(doc: Document): void;
}) {
  const trackedIframes = new Set<HTMLIFrameElement>();
  const cleanupByIframe = new Map<HTMLIFrameElement, () => void>();
  const documentByIframe = new Map<HTMLIFrameElement, Document>();

  const unregisterIframe = (iframe: HTMLIFrameElement) => {
    const iframeDocument = documentByIframe.get(iframe);
    if (iframeDocument) {
      iframeDocument.querySelectorAll('iframe').forEach((nested) => unregisterIframe(nested));
      args.unregisterDocument(iframeDocument);
      documentByIframe.delete(iframe);
    }
    cleanupByIframe.get(iframe)?.();
    cleanupByIframe.delete(iframe);
    trackedIframes.delete(iframe);
  };

  const registerIframe = (iframe: HTMLIFrameElement) => {
    if (!trackedIframes.has(iframe)) {
      trackedIframes.add(iframe);
      const handleLoad = () => {
        registerIframeDocument(iframe);
        args.invalidate();
      };
      iframe.addEventListener('load', handleLoad);
      cleanupByIframe.set(iframe, () => iframe.removeEventListener('load', handleLoad));
    }
    registerIframeDocument(iframe);
  };

  const registerIframeDocument = (iframe: HTMLIFrameElement) => {
    if (!isIframeAccessible(iframe)) {
      const previous = documentByIframe.get(iframe);
      if (previous) {
        previous.querySelectorAll('iframe').forEach((nested) => unregisterIframe(nested));
        args.unregisterDocument(previous);
        documentByIframe.delete(iframe);
      }
      return;
    }
    const doc = getIframeDocument(iframe);
    if (!doc) return;
    const previous = documentByIframe.get(iframe);
    if (previous && previous !== doc) {
      previous.querySelectorAll('iframe').forEach((nested) => unregisterIframe(nested));
      args.unregisterDocument(previous);
    }
    documentByIframe.set(iframe, doc);
    args.registerDocument(doc);
    registerDocument(doc);
  };

  const registerNode = (node: Node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    if (element.tagName.toLowerCase() === 'iframe') {
      registerIframe(element as HTMLIFrameElement);
    }
    element.querySelectorAll('iframe').forEach((iframe) => registerIframe(iframe));
  };

  const registerDocument = (doc: Document) => {
    doc.querySelectorAll('iframe').forEach((iframe) => registerIframe(iframe));
  };

  const unregisterNode = (node: Node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    if (element.tagName.toLowerCase() === 'iframe') {
      unregisterIframe(element as HTMLIFrameElement);
    }
    element.querySelectorAll('iframe').forEach((iframe) => unregisterIframe(iframe));
  };

  return {
    dispose() {
      Array.from(trackedIframes).forEach((iframe) => unregisterIframe(iframe));
      cleanupByIframe.clear();
      documentByIframe.clear();
      trackedIframes.clear();
    },
    registerDocument,
    registerNode,
    unregisterNode,
  };
}
