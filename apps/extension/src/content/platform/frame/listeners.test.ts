// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const iframeCoreMocks = vi.hoisted(() => ({
  getAccessibleIframesMock: vi.fn(),
  getIframeDocumentMock: vi.fn(),
  isIframeAccessibleMock: vi.fn(),
}));

vi.mock('./core', () => ({
  getAccessibleIframes: iframeCoreMocks.getAccessibleIframesMock,
  getIframeDocument: iframeCoreMocks.getIframeDocumentMock,
  isIframeAccessible: iframeCoreMocks.isIframeAccessibleMock,
}));

type MutationRecordLike = Pick<MutationRecord, 'addedNodes'>;

class FakeMutationObserver {
  static instances: FakeMutationObserver[] = [];

  constructor(public readonly callback: (mutations: MutationRecordLike[]) => void) {
    FakeMutationObserver.instances.push(this);
  }

  disconnect = vi.fn();

  observe = vi.fn();

  emit(...addedNodes: Node[]) {
    this.callback([{ addedNodes: addedNodes as unknown as NodeList }]);
  }

  static reset() {
    FakeMutationObserver.instances = [];
  }
}

function createDocumentWithReadyState(readyState: DocumentReadyState): Document {
  const doc = document.implementation.createHTMLDocument('iframe');
  Object.defineProperty(doc, 'readyState', {
    configurable: true,
    get: () => readyState,
  });

  return doc;
}

function configureDynamicMutationMocks(
  directIframe: HTMLIFrameElement,
  nestedIframe: HTMLIFrameElement,
  inaccessibleIframe: HTMLIFrameElement,
  directDoc: Document,
  nestedDoc: Document
): void {
  iframeCoreMocks.getAccessibleIframesMock.mockReturnValue([]);
  iframeCoreMocks.getIframeDocumentMock.mockImplementation((iframe: HTMLIFrameElement) => {
    if (iframe === directIframe) {
      return directDoc;
    }

    if (iframe === nestedIframe) {
      return nestedDoc;
    }

    return null;
  });
  iframeCoreMocks.isIframeAccessibleMock.mockImplementation(
    (iframe: HTMLIFrameElement) => iframe !== inaccessibleIframe
  );
}

beforeEach(() => {
  vi.resetModules();
  FakeMutationObserver.reset();
  vi.stubGlobal('MutationObserver', FakeMutationObserver);
  iframeCoreMocks.getAccessibleIframesMock.mockReset();
  iframeCoreMocks.getIframeDocumentMock.mockReset();
  iframeCoreMocks.isIframeAccessibleMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('iframe-utils listeners DOMContentLoaded flow', () => {
  it('attaches iframe listeners after DOMContentLoaded and avoids duplicate registration on load', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const iframe = document.createElement('iframe');
    const iframeDoc = createDocumentWithReadyState('loading');
    const handler = vi.fn();

    iframeCoreMocks.getAccessibleIframesMock.mockImplementation((rootDoc?: Document) =>
      rootDoc && rootDoc !== document ? [] : [iframe]
    );
    iframeCoreMocks.getIframeDocumentMock.mockImplementation((candidate: HTMLIFrameElement) =>
      candidate === iframe ? iframeDoc : null
    );
    iframeCoreMocks.isIframeAccessibleMock.mockReturnValue(true);

    const { addEventListenerToAllWindowsDynamic } = await import('./listeners');
    const cleanup = addEventListenerToAllWindowsDynamic<MouseEvent>('mousemove', handler, {
      capture: true,
    });

    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    iframeDoc.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    expect(handler).toHaveBeenCalledTimes(1);

    iframeDoc.dispatchEvent(new Event('DOMContentLoaded'));
    iframeDoc.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenLastCalledWith(expect.any(MouseEvent), iframe);

    iframe.dispatchEvent(new Event('load'));
    iframeDoc.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    expect(handler).toHaveBeenCalledTimes(3);

    cleanup();

    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[iframe-utils]',
      '[iframe-utils] Added mousemove listener to iframe:',
      ''
    );
    expect(consoleLogSpy).toHaveBeenCalledWith('[iframe-utils]', 'Cleaning up all event listeners');
  });
});

describe('iframe-utils listeners dynamic mutation flow', () => {
  it('observes iframe mutations, ignores owned overlays, and handles inaccessible iframe loads', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const directIframe = document.createElement('iframe');
    const nestedIframe = document.createElement('iframe');
    const inaccessibleIframe = document.createElement('iframe');
    const directDoc = createDocumentWithReadyState('complete');
    const nestedDoc = createDocumentWithReadyState('complete');
    const handler = vi.fn();

    configureDynamicMutationMocks(
      directIframe,
      nestedIframe,
      inaccessibleIframe,
      directDoc,
      nestedDoc
    );

    const { addEventListenerToAllWindowsDynamic } = await import('./listeners');
    const cleanup = addEventListenerToAllWindowsDynamic<MouseEvent>('mousemove', handler, {
      capture: true,
    });
    const observer = FakeMutationObserver.instances[0];

    const ownedWrapper = document.createElement('div');
    ownedWrapper.className = 'sniptale-highlight-container';
    ownedWrapper.append(nestedIframe.cloneNode() as HTMLIFrameElement);

    const nestedWrapper = document.createElement('div');
    nestedWrapper.append(nestedIframe);

    observer?.emit(document.createTextNode('ignored'));
    observer?.emit(ownedWrapper);
    observer?.emit(directIframe);
    observer?.emit(nestedWrapper);
    observer?.emit(inaccessibleIframe);

    directDoc.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    nestedDoc.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    inaccessibleIframe.dispatchEvent(new Event('load'));

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenNthCalledWith(1, expect.any(MouseEvent), directIframe);
    expect(handler).toHaveBeenNthCalledWith(2, expect.any(MouseEvent), nestedIframe);

    cleanup();
    expect(observer?.disconnect).toHaveBeenCalled();
  });
});

describe('iframe-utils listeners top-level cleanup flow', () => {
  it('removes top-document listeners even when there are no accessible iframes', async () => {
    const handler = vi.fn();
    iframeCoreMocks.getAccessibleIframesMock.mockReturnValue([]);
    iframeCoreMocks.getIframeDocumentMock.mockReturnValue(null);
    iframeCoreMocks.isIframeAccessibleMock.mockReturnValue(false);

    const { addEventListenerToAllWindowsDynamic } = await import('./listeners');
    const cleanup = addEventListenerToAllWindowsDynamic<MouseEvent>('mousemove', handler);

    expect(FakeMutationObserver.instances).toHaveLength(1);

    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    expect(handler).toHaveBeenCalledTimes(1);

    cleanup();
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('iframe-utils listeners scoped root flow', () => {
  it('attaches listeners from an injected root document and root iframe', async () => {
    const rootIframe = document.createElement('iframe');
    const rootDoc = createDocumentWithReadyState('complete');
    const nestedIframe = document.createElement('iframe');
    const nestedDoc = createDocumentWithReadyState('complete');
    const handler = vi.fn();
    iframeCoreMocks.getAccessibleIframesMock.mockImplementation((doc?: Document) =>
      doc === rootDoc ? [nestedIframe] : []
    );
    iframeCoreMocks.getIframeDocumentMock.mockImplementation((iframe: HTMLIFrameElement) =>
      iframe === nestedIframe ? nestedDoc : null
    );
    iframeCoreMocks.isIframeAccessibleMock.mockReturnValue(true);

    const { addEventListenerToAllWindowsDynamic } = await import('./listeners');
    const cleanup = addEventListenerToAllWindowsDynamic<MouseEvent>(
      'mousemove',
      handler,
      { capture: true },
      { rootDocument: rootDoc, rootIframe }
    );

    rootDoc.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    nestedDoc.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));

    expect(handler).toHaveBeenNthCalledWith(1, expect.any(MouseEvent), rootIframe);
    expect(handler).toHaveBeenNthCalledWith(2, expect.any(MouseEvent), nestedIframe);

    cleanup();
  });
});
