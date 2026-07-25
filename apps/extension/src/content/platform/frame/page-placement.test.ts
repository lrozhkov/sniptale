// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDocumentPagePlacement,
  getDocumentViewportBounds,
  getTopViewportPoint,
  resolveDocumentPagePlacement,
  updateDocumentPagePlacement,
} from './page-placement';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('document page placement', () => {
  it('keeps a top-document point attached to page coordinates while scrolling', () => {
    vi.spyOn(window, 'scrollX', 'get').mockReturnValue(40);
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(80);
    const placement = createDocumentPagePlacement(document, 120, 160);

    expect(placement).toEqual({ iframePath: [], pageX: 160, pageY: 240 });
    vi.spyOn(window, 'scrollX', 'get').mockReturnValue(70);
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(100);
    expect(resolveDocumentPagePlacement(placement!)).toEqual({ x: 90, y: 140 });
    expect(updateDocumentPagePlacement(placement!, 110, 130)).toEqual({
      iframePath: [],
      pageX: 180,
      pageY: 230,
    });
  });

  it('translates same-origin iframe-local points into the top viewport', () => {
    const iframe = document.createElement('iframe');
    iframe.id = 'content-frame';
    document.body.append(iframe);
    vi.spyOn(iframe, 'getBoundingClientRect').mockReturnValue(new DOMRect(200, 100, 400, 300));
    Object.defineProperty(iframe, 'clientLeft', { configurable: true, value: 2 });
    Object.defineProperty(iframe, 'clientTop', { configurable: true, value: 3 });
    const iframeDocument = iframe.contentDocument!;

    expect(getTopViewportPoint(iframeDocument, 25, 35)).toEqual({ x: 227, y: 138 });
    expect(getDocumentViewportBounds(iframeDocument)).toMatchObject({ x: 202, y: 103 });
    const placement = createDocumentPagePlacement(iframeDocument, 227, 138);
    expect(placement).toMatchObject({
      iframePath: ['iframe#content-frame'],
      pageX: 25,
      pageY: 35,
    });
    expect(resolveDocumentPagePlacement(placement!)).toEqual({ x: 227, y: 138 });
  });

  it('resolves nested anonymous iframes through their scoped structural paths', () => {
    const ignoredContainer = document.createElement('section');
    ignoredContainer.append(document.createElement('iframe'));
    const outerContainer = document.createElement('section');
    const outer = document.createElement('iframe');
    outerContainer.append(outer);
    document.body.append(ignoredContainer, outerContainer);
    vi.spyOn(outer, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 50, 500, 400));

    const innerContainer = outer.contentDocument!.createElement('div');
    const inner = outer.contentDocument!.createElement('iframe');
    innerContainer.append(inner);
    outer.contentDocument!.body.append(innerContainer);
    vi.spyOn(inner, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 30, 200, 150));

    const placement = createDocumentPagePlacement(inner.contentDocument!, 125, 87);

    expect(placement?.iframePath).toHaveLength(2);
    expect(resolveDocumentPagePlacement(placement!)).toEqual({ x: 125, y: 87 });
  });
});
