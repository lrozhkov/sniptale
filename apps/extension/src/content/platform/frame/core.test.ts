// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getAbsolutePosition,
  getAccessibleIframes,
  getContainingIframe,
  getElementAtPoint,
  getIframeDocument,
  getViewportClientPoint,
  isIframeAccessible,
  walkAllDocuments,
} from './core';

type RectLike = {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  right?: number;
  bottom?: number;
};

function setRect(target: Element, rect: RectLike): void {
  Object.defineProperty(target, 'getBoundingClientRect', {
    configurable: true,
    value: () =>
      ({
        x: rect.left ?? 0,
        y: rect.top ?? 0,
        left: rect.left ?? 0,
        top: rect.top ?? 0,
        width: rect.width ?? 0,
        height: rect.height ?? 0,
        right: rect.right ?? (rect.left ?? 0) + (rect.width ?? 0),
        bottom: rect.bottom ?? (rect.top ?? 0) + (rect.height ?? 0),
        toJSON: () => ({}),
      }) satisfies DOMRect,
  });
}

function createAccessibleIframe(options?: { src?: string }) {
  const iframe = document.createElement('iframe');
  if (options?.src) {
    iframe.src = options.src;
  }

  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument;
  const iframeWindow = iframe.contentWindow;
  if (!iframeDoc || !iframeWindow) {
    throw new Error('Expected jsdom iframe document');
  }

  Object.defineProperty(iframeWindow, 'frameElement', {
    configurable: true,
    value: iframe,
  });

  return { iframe, iframeDoc, iframeWindow };
}

function createFallbackIframeWithWindow(doc: Document): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);

  Object.defineProperty(iframe, 'contentDocument', {
    configurable: true,
    get: () => null,
  });
  Object.defineProperty(iframe, 'contentWindow', {
    configurable: true,
    get: () => ({ document: doc }),
  });

  return iframe;
}

function createBrokenIframe(src: string): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.src = src;
  document.body.appendChild(iframe);

  Object.defineProperty(iframe, 'contentDocument', {
    configurable: true,
    get: () => null,
  });
  Object.defineProperty(iframe, 'contentWindow', {
    configurable: true,
    get: () => {
      throw new Error('cross-origin');
    },
  });

  return iframe;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('iframe-utils-core accessibility helpers', () => {
  it('reads iframe documents through direct, fallback, and guarded access paths', () => {
    const { iframe: directIframe, iframeDoc } = createAccessibleIframe();
    const fallbackDoc = document.implementation.createHTMLDocument('fallback');
    const fallbackIframe = createFallbackIframeWithWindow(fallbackDoc);
    const brokenIframe = createBrokenIframe('https://example.com/frame');
    const aboutIframe = createBrokenIframe('about:blank');

    expect(getIframeDocument(directIframe)).toBe(iframeDoc);
    expect(getIframeDocument(fallbackIframe)).toBe(fallbackDoc);
    expect(getIframeDocument(brokenIframe)).toBeNull();

    expect(isIframeAccessible(directIframe)).toBe(true);
    expect(isIframeAccessible(fallbackIframe)).toBe(true);
    expect(isIframeAccessible(aboutIframe)).toBe(true);
    expect(isIframeAccessible(brokenIframe)).toBe(false);

    expect(getAccessibleIframes()).toEqual(
      expect.arrayContaining([directIframe, fallbackIframe, aboutIframe])
    );
    expect(getAccessibleIframes()).not.toContain(brokenIframe);
  });
});

describe('iframe-utils-core geometry helpers', () => {
  it('translates viewport points for top-level and iframe-local coordinates', () => {
    const { iframe } = createAccessibleIframe();
    Object.defineProperty(iframe, 'clientLeft', {
      configurable: true,
      value: 3,
    });
    Object.defineProperty(iframe, 'clientTop', {
      configurable: true,
      value: 4,
    });
    setRect(iframe, { left: 100, top: 200, width: 160, height: 120 });

    expect(getViewportClientPoint(5, 6)).toEqual({ x: 5, y: 6 });
    expect(getViewportClientPoint(5, 6, iframe)).toEqual({ x: 108, y: 210 });
  });

  it('computes absolute positions and containing iframes for nested and detached documents', () => {
    const { iframe, iframeDoc } = createAccessibleIframe();
    setRect(iframe, { left: 100, top: 200, width: 160, height: 120 });

    const nestedElement = iframeDoc.createElement('div');
    iframeDoc.body.appendChild(nestedElement);
    setRect(nestedElement, { left: 5, top: 6, width: 7, height: 8 });

    const detachedDoc = document.implementation.createHTMLDocument('detached');
    const detachedElement = detachedDoc.createElement('section');
    detachedDoc.body.appendChild(detachedElement);
    setRect(detachedElement, { left: 9, top: 10, width: 11, height: 12 });

    const topElement = document.createElement('main');
    document.body.appendChild(topElement);

    expect(getAbsolutePosition(nestedElement)).toEqual({ x: 105, y: 206, width: 7, height: 8 });
    expect(getAbsolutePosition(detachedElement)).toEqual({ x: 9, y: 10, width: 11, height: 12 });
    expect(getContainingIframe(topElement)).toBeNull();
    expect(getContainingIframe(nestedElement)).toBe(iframe);
  });
});

describe('iframe-utils-core document walking', () => {
  it('walks each accessible document once and skips about: iframes without documents', () => {
    const { iframe: firstIframe, iframeDoc } = createAccessibleIframe();
    const secondIframe = createFallbackIframeWithWindow(iframeDoc);
    const aboutIframe = document.createElement('iframe');
    aboutIframe.src = 'about:blank';
    document.body.appendChild(aboutIframe);

    Object.defineProperty(aboutIframe, 'contentDocument', {
      configurable: true,
      get: () => null,
    });
    Object.defineProperty(aboutIframe, 'contentWindow', {
      configurable: true,
      get: () => null,
    });

    const visits: Array<{ doc: Document; iframe?: HTMLIFrameElement }> = [];
    walkAllDocuments((doc, iframe) => {
      visits.push({ doc, ...(iframe === undefined ? {} : { iframe }) });
    });

    expect(visits).toEqual([
      { doc: document, iframe: undefined },
      { doc: iframeDoc, iframe: firstIframe },
    ]);
    expect(visits.find(({ iframe }) => iframe === secondIframe)).toBeUndefined();
    expect(visits.find(({ iframe }) => iframe === aboutIframe)).toBeUndefined();
  });
});

describe('iframe-utils-core top-level point lookup', () => {
  it('prefers iframe hits, then falls back to the top document, then returns null', () => {
    const { iframe, iframeDoc } = createAccessibleIframe();
    const iframeHit = iframeDoc.createElement('button');
    const topHit = document.createElement('div');
    document.body.appendChild(topHit);

    setRect(iframe, { left: 50, top: 80, width: 100, height: 100 });

    const iframeElementFromPoint = vi.fn<(x: number, y: number) => Element | null>();
    iframeElementFromPoint.mockReturnValueOnce(iframeHit).mockReturnValueOnce(null);
    Object.defineProperty(iframeDoc, 'elementFromPoint', {
      configurable: true,
      value: iframeElementFromPoint,
    });

    const topElementFromPoint = vi.fn<(x: number, y: number) => Element | null>();
    topElementFromPoint.mockReturnValueOnce(topHit).mockReturnValueOnce(null);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: topElementFromPoint,
    });

    expect(getElementAtPoint(60, 100)).toEqual({ element: iframeHit, iframe });
    expect(iframeElementFromPoint).toHaveBeenCalledWith(10, 20);

    expect(getElementAtPoint(60, 100)).toEqual({ element: topHit });
    expect(getElementAtPoint(10, 10)).toBeNull();
    expect(topElementFromPoint).toHaveBeenCalledWith(60, 100);
    expect(topElementFromPoint).toHaveBeenCalledWith(10, 10);
  });
});

describe('iframe-utils-core nested point lookup', () => {
  it('searches through nested iframe documents', () => {
    const { iframe: parentIframe, iframeDoc: parentDoc } = createAccessibleIframe();
    const childIframe = parentDoc.createElement('iframe');
    parentDoc.body.appendChild(childIframe);

    const childDoc = childIframe.contentDocument;
    const childWindow = childIframe.contentWindow;
    if (!childDoc || !childWindow) {
      throw new Error('Expected nested jsdom iframe document');
    }

    Object.defineProperty(childWindow, 'frameElement', {
      configurable: true,
      value: childIframe,
    });

    const nestedHit = childDoc.createElement('button');
    setRect(parentIframe, { left: 50, top: 80, width: 100, height: 100 });
    setRect(childIframe, { left: 8, top: 12, width: 40, height: 30 });

    Object.defineProperty(parentDoc, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => childIframe),
    });
    Object.defineProperty(childDoc, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => nestedHit),
    });

    expect(getElementAtPoint(60, 100)).toEqual({ element: nestedHit, iframe: childIframe });
  });
});
