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

vi.mock('./discovery', () => ({
  collectIframeElements: (node: HTMLElement) =>
    Array.from(node.querySelectorAll('iframe')) as HTMLIFrameElement[],
  shouldIgnoreIframeMutation: () => false,
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

beforeEach(() => {
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

describe('iframe document tree helper', () => {
  it('attaches existing iframe documents immediately', async () => {
    const iframe = document.createElement('iframe');
    const iframeDoc = createDocumentWithReadyState('complete');
    const onIframeDocument = vi.fn();

    iframeCoreMocks.getAccessibleIframesMock.mockReturnValue([iframe]);
    iframeCoreMocks.getIframeDocumentMock.mockReturnValue(iframeDoc);
    iframeCoreMocks.isIframeAccessibleMock.mockReturnValue(true);

    const { attachIframeDocumentTree } = await import('./document-tree');
    attachIframeDocumentTree(document, {
      cleanupFns: [],
      observedDocs: new WeakSet<Document>(),
      onIframeDocument,
    });

    expect(onIframeDocument).toHaveBeenCalledWith(iframeDoc, iframe);
  });

  it('observes added iframes and waits for DOMContentLoaded when required', async () => {
    const iframe = document.createElement('iframe');
    const iframeDoc = createDocumentWithReadyState('loading');
    const onIframeDocument = vi.fn();

    iframeCoreMocks.getAccessibleIframesMock.mockReturnValue([]);
    iframeCoreMocks.getIframeDocumentMock.mockReturnValue(iframeDoc);
    iframeCoreMocks.isIframeAccessibleMock.mockReturnValue(true);

    const cleanupFns: Array<() => void> = [];
    const { attachIframeDocumentTree } = await import('./document-tree');
    attachIframeDocumentTree(document, {
      cleanupFns,
      observedDocs: new WeakSet<Document>(),
      onIframeDocument,
      requireDocumentReady: true,
    });

    const wrapper = document.createElement('div');
    wrapper.append(iframe);
    FakeMutationObserver.instances[0]?.emit(wrapper);

    expect(onIframeDocument).not.toHaveBeenCalled();

    iframeDoc.dispatchEvent(new Event('DOMContentLoaded'));
    expect(onIframeDocument).toHaveBeenCalledWith(iframeDoc, iframe);

    cleanupFns.forEach((cleanup) => cleanup());
  });
});
