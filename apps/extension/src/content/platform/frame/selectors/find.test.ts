// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const coreMocks = vi.hoisted(() => ({
  getAccessibleIframes: vi.fn<() => HTMLIFrameElement[]>(),
  getIframeDocument: vi.fn<(iframe: HTMLIFrameElement) => Document | null>(),
  isIframeAccessible: vi.fn<(iframe: HTMLIFrameElement) => boolean>(),
}));

vi.mock('../core', () => coreMocks);

import {
  findElementByCompositeSelector,
  findElementBySelector,
  findHtmlElementBySelector,
} from './find';

beforeEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
  coreMocks.getAccessibleIframes.mockReturnValue([]);
  coreMocks.getIframeDocument.mockReturnValue(null);
  coreMocks.isIframeAccessible.mockReturnValue(true);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('iframe selector composite lookup', () => {
  it('finds exact iframe contents and rejects missing, inaccessible, or non-iframe roots', () => {
    expect(
      findElementByCompositeSelector({
        iframeSelector: 'iframe#missing',
        elementSelector: '.target',
      })
    ).toBeNull();

    const lookalike = document.createElement('div');
    lookalike.className = 'not-an-iframe';
    document.body.append(lookalike);
    expect(
      findElementByCompositeSelector({
        iframeSelector: '.not-an-iframe',
        elementSelector: '.target',
      })
    ).toBeNull();

    const blockedIframe = document.createElement('iframe');
    blockedIframe.id = 'blocked';
    document.body.append(blockedIframe);
    coreMocks.isIframeAccessible.mockReturnValueOnce(false);
    expect(
      findElementByCompositeSelector({
        iframeSelector: 'iframe#blocked',
        elementSelector: '.target',
      })
    ).toBeNull();

    const accessibleIframe = document.createElement('iframe');
    accessibleIframe.id = 'ok';
    const iframeDocument = document.implementation.createHTMLDocument('iframe');
    const target = iframeDocument.createElement('button');
    target.className = 'target';
    iframeDocument.body.append(target);
    Object.defineProperty(accessibleIframe, 'contentDocument', {
      configurable: true,
      value: iframeDocument,
    });
    document.body.append(accessibleIframe);

    expect(
      findElementByCompositeSelector({
        iframeSelector: 'iframe#ok',
        elementSelector: '.target',
      })
    ).toBe(target);
    expect(console.warn).toHaveBeenCalledTimes(3);
  });
});

describe('iframe selector nested lookup', () => {
  it('finds universal Element targets in the top document and nested iframe documents', () => {
    const topLevel = document.createElement('div');
    topLevel.className = 'top-level-target';
    document.body.append(topLevel);
    expect(findElementBySelector('.top-level-target')).toBe(topLevel);

    const outerIframe = document.createElement('iframe');
    const nestedIframe = document.createElement('iframe');
    const outerDocument = document.implementation.createHTMLDocument('outer');
    const nestedDocument = document.implementation.createHTMLDocument('nested');
    const nestedTarget = nestedDocument.createElement('button');
    nestedTarget.className = 'nested-target';
    nestedDocument.body.append(nestedTarget);
    outerDocument.body.append(nestedIframe);

    coreMocks.getAccessibleIframes.mockImplementation((rootDoc: Document = document) =>
      rootDoc === document ? [outerIframe] : [nestedIframe]
    );
    coreMocks.getIframeDocument.mockImplementation((iframe) => {
      if (iframe === outerIframe) return outerDocument;
      if (iframe === nestedIframe) return nestedDocument;
      return null;
    });
    expect(findElementBySelector('.nested-target')).toBe(nestedTarget);
  });

  it('keeps HTML narrowing explicit and rejects an SVG result', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.classList.add('svg-target');
    svg.append(circle);
    document.body.append(svg);

    expect(findElementBySelector('.svg-target')).toBe(circle);
    expect(findHtmlElementBySelector('.svg-target')).toBeNull();
  });
});
