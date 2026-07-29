// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

const frameMocks = vi.hoisted(() => ({
  documents: new Map<HTMLIFrameElement, Document>(),
  isIframeAccessible: vi.fn(() => true),
}));

vi.mock('../../../platform/frame', async (importOriginal) => ({
  ...(await importOriginal()),
  getIframeDocument: (iframe: HTMLIFrameElement) => frameMocks.documents.get(iframe) ?? null,
  isIframeAccessible: frameMocks.isIframeAccessible,
}));

import { createIframeSignalRegistry } from './iframe-signals';

afterEach(() => {
  document.body.replaceChildren();
  frameMocks.documents.clear();
  frameMocks.isIframeAccessible.mockReset();
  frameMocks.isIframeAccessible.mockReturnValue(true);
});

describe('same-origin iframe signals', () => {
  it('replaces stale iframe documents on load and removes every listener on disposal', () => {
    const firstDocument = document.implementation.createHTMLDocument('first');
    const secondDocument = document.implementation.createHTMLDocument('second');
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    frameMocks.documents.set(iframe, firstDocument);
    const registerDocument = vi.fn();
    const unregisterDocument = vi.fn();
    const invalidate = vi.fn();
    const signals = createIframeSignalRegistry({
      invalidate,
      registerDocument,
      unregisterDocument,
    });

    signals.registerDocument(document);
    expect(registerDocument).toHaveBeenCalledWith(firstDocument);

    frameMocks.documents.set(iframe, secondDocument);
    iframe.dispatchEvent(new Event('load'));
    expect(unregisterDocument).toHaveBeenCalledWith(firstDocument);
    expect(registerDocument).toHaveBeenCalledWith(secondDocument);
    expect(invalidate).toHaveBeenCalledTimes(1);

    signals.dispose();
    expect(unregisterDocument).toHaveBeenCalledWith(secondDocument);
    iframe.dispatchEvent(new Event('load'));
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('registers and unregisters iframe descendants from dynamic subtrees', () => {
    const wrapper = document.createElement('div');
    const iframe = document.createElement('iframe');
    const iframeDocument = document.implementation.createHTMLDocument('dynamic');
    wrapper.appendChild(iframe);
    frameMocks.documents.set(iframe, iframeDocument);
    const registerDocument = vi.fn();
    const unregisterDocument = vi.fn();
    const signals = createIframeSignalRegistry({
      invalidate: vi.fn(),
      registerDocument,
      unregisterDocument,
    });

    signals.registerNode(wrapper);
    expect(registerDocument).toHaveBeenCalledWith(iframeDocument);

    signals.unregisterNode(wrapper);
    expect(unregisterDocument).toHaveBeenCalledWith(iframeDocument);
    signals.dispose();
  });
});
