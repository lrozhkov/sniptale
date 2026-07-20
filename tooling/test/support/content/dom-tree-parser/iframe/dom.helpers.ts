export function appendElement<T extends keyof HTMLElementTagNameMap>(
  parent: HTMLElement,
  tagName: T,
  props?: Partial<HTMLElementTagNameMap[T]>
): HTMLElementTagNameMap[T] {
  const element = document.createElement(tagName);
  if (props) {
    Object.assign(element, props);
  }
  parent.append(element);
  return element;
}

export function appendIframeElement<T extends keyof HTMLElementTagNameMap>(
  doc: Document,
  parent: HTMLElement,
  tagName: T,
  props?: Partial<HTMLElementTagNameMap[T]>
): HTMLElementTagNameMap[T] {
  const element = doc.createElement(tagName);
  if (props) {
    Object.assign(element, props);
  }
  parent.append(element);
  return element;
}

export function ensureIframeDocument(iframe: HTMLIFrameElement) {
  const iframeDoc = iframe.contentDocument;
  const iframeWindow = iframe.contentWindow;
  if (!iframeDoc || !iframeWindow) {
    throw new Error('Expected iframe document');
  }

  if (!iframeDoc.documentElement) {
    iframeDoc.append(iframeDoc.createElement('html'));
  }
  if (!iframeDoc.head) {
    iframeDoc.documentElement.append(iframeDoc.createElement('head'));
  }
  if (!iframeDoc.body) {
    iframeDoc.documentElement.append(iframeDoc.createElement('body'));
  }

  Object.defineProperty(iframeWindow, 'frameElement', {
    configurable: true,
    value: iframe,
  });

  return iframeDoc;
}
