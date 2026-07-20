export function isElementInsideSnapshotIframe(
  element: HTMLElement,
  iframe: HTMLIFrameElement
): boolean {
  const snapshotDocument = iframe.contentDocument;
  let currentDocument: Document | null = element.ownerDocument;

  while (currentDocument) {
    if (currentDocument === snapshotDocument) {
      return true;
    }

    if (currentDocument === document) {
      return false;
    }

    currentDocument =
      (currentDocument.defaultView?.frameElement as HTMLIFrameElement | null)?.ownerDocument ??
      null;
  }

  return false;
}
