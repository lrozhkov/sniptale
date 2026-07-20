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

function getStyle(doc: Document, styleId: string): HTMLStyleElement | null {
  return doc.getElementById(styleId) as HTMLStyleElement | null;
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

describe('mountStyleInAccessibleDocuments ready document flow', () => {
  it('mounts styles into ready iframe documents and avoids duplicates after load', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const iframe = document.createElement('iframe');
    const iframeDoc = createDocumentWithReadyState('complete');

    iframeCoreMocks.getAccessibleIframesMock.mockImplementation((rootDoc?: Document) =>
      rootDoc && rootDoc !== document ? [] : [iframe]
    );
    iframeCoreMocks.getIframeDocumentMock.mockImplementation((candidate: HTMLIFrameElement) =>
      candidate === iframe ? iframeDoc : null
    );
    iframeCoreMocks.isIframeAccessibleMock.mockReturnValue(true);

    const { mountStyleInAccessibleDocuments } = await import('./documents');
    const cleanup = mountStyleInAccessibleDocuments({
      styleId: 'sniptale-test-style',
      textContent: '.sniptale-test { color: red; }',
    });

    expect(getStyle(document, 'sniptale-test-style')?.textContent).toBe(
      '.sniptale-test { color: red; }'
    );
    expect(getStyle(iframeDoc, 'sniptale-test-style')?.textContent).toBe(
      '.sniptale-test { color: red; }'
    );

    iframe.dispatchEvent(new Event('load'));
    expect(iframeDoc.querySelectorAll('#sniptale-test-style')).toHaveLength(1);

    cleanup();

    expect(getStyle(document, 'sniptale-test-style')).toBeNull();
    expect(getStyle(iframeDoc, 'sniptale-test-style')).toBeNull();
    expect(debugSpy).toHaveBeenCalledWith(
      '[FrameIframeDiag]',
      'mountStyleInDocument',
      expect.objectContaining({ styleId: 'sniptale-test-style' })
    );
  });
});

describe('mountStyleInAccessibleDocuments loading document flow', () => {
  it('waits for loading iframe documents and swallows ready-listener cleanup errors', async () => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});

    const iframe = document.createElement('iframe');
    const iframeDoc = createDocumentWithReadyState('loading');
    const removeEventListenerSpy = vi.fn(() => {
      throw new Error('document became invalid');
    });

    Object.defineProperty(iframeDoc, 'removeEventListener', {
      configurable: true,
      value: removeEventListenerSpy,
    });

    iframeCoreMocks.getAccessibleIframesMock.mockImplementation((rootDoc?: Document) =>
      rootDoc && rootDoc !== document ? [] : [iframe]
    );
    iframeCoreMocks.getIframeDocumentMock.mockImplementation((candidate: HTMLIFrameElement) =>
      candidate === iframe ? iframeDoc : null
    );
    iframeCoreMocks.isIframeAccessibleMock.mockReturnValue(true);

    const { mountStyleInAccessibleDocuments } = await import('./documents');
    const cleanup = mountStyleInAccessibleDocuments({
      styleId: 'sniptale-loading-style',
      textContent: '.sniptale-loading { color: blue; }',
    });

    expect(getStyle(iframeDoc, 'sniptale-loading-style')).toBeNull();

    iframeDoc.dispatchEvent(new Event('DOMContentLoaded'));
    expect(getStyle(iframeDoc, 'sniptale-loading-style')?.textContent).toBe(
      '.sniptale-loading { color: blue; }'
    );

    expect(() => cleanup()).not.toThrow();
    expect(removeEventListenerSpy).toHaveBeenCalledWith('DOMContentLoaded', expect.any(Function));
  });
});

describe('mountStyleInAccessibleDocuments mutation flow', () => {
  it('observes inserted iframes, ignores owned overlays, and skips inaccessible loads', async () => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});

    const insertedIframe = document.createElement('iframe');
    const inaccessibleIframe = document.createElement('iframe');
    const insertedDoc = createDocumentWithReadyState('complete');

    iframeCoreMocks.getAccessibleIframesMock.mockReturnValue([]);
    iframeCoreMocks.getIframeDocumentMock.mockImplementation((candidate: HTMLIFrameElement) =>
      candidate === insertedIframe ? insertedDoc : null
    );
    iframeCoreMocks.isIframeAccessibleMock.mockImplementation(
      (candidate: HTMLIFrameElement) => candidate !== inaccessibleIframe
    );

    const { mountStyleInAccessibleDocuments } = await import('./documents');
    const cleanup = mountStyleInAccessibleDocuments({
      styleId: 'sniptale-dynamic-style',
      textContent: '.sniptale-dynamic { color: green; }',
    });
    const observer = FakeMutationObserver.instances[0];

    const ownedWrapper = document.createElement('div');
    ownedWrapper.className = 'sniptale-app';
    ownedWrapper.append(insertedIframe.cloneNode() as HTMLIFrameElement);

    const nestedWrapper = document.createElement('div');
    nestedWrapper.append(insertedIframe);

    observer?.emit(document.createTextNode('ignored'));
    observer?.emit(ownedWrapper);
    expect(getStyle(insertedDoc, 'sniptale-dynamic-style')).toBeNull();

    observer?.emit(nestedWrapper);
    expect(getStyle(insertedDoc, 'sniptale-dynamic-style')?.textContent).toBe(
      '.sniptale-dynamic { color: green; }'
    );

    observer?.emit(inaccessibleIframe);
    inaccessibleIframe.dispatchEvent(new Event('load'));
    expect(getStyle(insertedDoc, 'sniptale-dynamic-style')).not.toBeNull();

    cleanup();
    expect(observer?.disconnect).toHaveBeenCalled();
  });
});

describe('mountStyleInAccessibleDocuments mutation edge cases', () => {
  it('ignores non-element mutation nodes without touching iframe state', async () => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    iframeCoreMocks.getAccessibleIframesMock.mockReturnValue([]);
    iframeCoreMocks.getIframeDocumentMock.mockReturnValue(null);
    iframeCoreMocks.isIframeAccessibleMock.mockReturnValue(false);

    const { mountStyleInAccessibleDocuments } = await import('./documents');
    const cleanup = mountStyleInAccessibleDocuments({
      styleId: 'sniptale-ignore-style',
      textContent: '.sniptale-ignore { color: purple; }',
    });
    const observer = FakeMutationObserver.instances[0];

    observer?.emit(document.createTextNode('ignored'));
    expect(document.getElementById('sniptale-ignore-style')?.textContent).toBe(
      '.sniptale-ignore { color: purple; }'
    );

    cleanup();
  });
});
