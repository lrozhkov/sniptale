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

export function ensureIframeDocument(iframe: HTMLIFrameElement): Document {
  const iframeDoc = iframe.contentDocument;
  const iframeWindow = iframe.contentWindow;
  if (!iframeDoc || !iframeWindow) {
    throw new Error('Expected iframe document');
  }

  Object.defineProperty(iframeWindow, 'frameElement', {
    configurable: true,
    value: iframe,
  });

  return iframeDoc;
}

export function appendIframeElement(
  doc: Document,
  parent: HTMLElement,
  tagName: string,
  props?: Record<string, unknown>
): HTMLElement {
  const element = doc.createElement(tagName) as HTMLElement;
  if (props) {
    Object.assign(element, props);
  }
  parent.append(element);
  return element;
}

export function createNaumenMvsEmbeddedAppContainer(): HTMLIFrameElement {
  const container = document.createElement('div');
  container.className = 'GAQEVERFM GAQEVERCOC GAQEVERGOC GAQEVERPOC GAQEVERBOC';
  container.id = 'gwt-debug-EmbeddedApplicationContent.rsmConfigItem';

  const outer = document.createElement('div');
  outer.className = 'GAQEVERCM';
  outer.id = 'gwt-debug-outer';
  const scrollable = document.createElement('div');
  scrollable.id = 'gwt-debug-scrollableArea';
  scrollable.className = 'wide-content';
  const iframe = document.createElement('iframe');
  iframe.id = 'iframe$mvs-fixture';
  iframe.setAttribute('data-application-code', 'mvs');
  iframe.setAttribute('data-origin', 'readForm');

  scrollable.append(iframe);
  outer.append(scrollable);
  container.append(outer);
  document.body.append(container);

  return iframe;
}
