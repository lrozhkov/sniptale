// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeContentUiRoots } from '../../../platform/dom-host';
import { isPageStyleMutationElement } from './element';

function appendVisible<T extends Element>(element: T, root: ParentNode = document.body): T {
  const rect = DOMRect.fromRect({ height: 40, width: 80 });
  Object.defineProperty(element, 'getClientRects', {
    configurable: true,
    value: () => ({
      0: rect,
      [Symbol.iterator]: () => [rect][Symbol.iterator](),
      item: (index: number) => (index === 0 ? rect : null),
      length: 1,
    }),
  });
  root.append(element);
  return element;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('page-style Element target eligibility', () => {
  it('accepts visible HTML, SVG, iframe, and a page-owned shadow host', () => {
    const html = appendVisible(document.createElement('section'));
    const svg = appendVisible(document.createElementNS('http://www.w3.org/2000/svg', 'rect'));
    const iframe = appendVisible(document.createElement('iframe'));
    const shadowHost = appendVisible(document.createElement('article'));
    shadowHost.attachShadow({ mode: 'open' });

    expect([html, svg, iframe, shadowHost].every(isPageStyleMutationElement)).toBe(true);
  });

  it('rejects page-owned open and closed shadow descendants without traversing them', () => {
    const openHost = appendVisible(document.createElement('div'));
    const openTarget = appendVisible(
      document.createElement('button'),
      openHost.attachShadow({ mode: 'open' })
    );
    const closedHost = appendVisible(document.createElement('div'));
    const closedTarget = appendVisible(
      document.createElement('button'),
      closedHost.attachShadow({ mode: 'closed' })
    );

    expect(isPageStyleMutationElement(openTarget)).toBe(false);
    expect(isPageStyleMutationElement(closedTarget)).toBe(false);
  });

  it('rejects content-owned UI while accepting page lookalikes', () => {
    const contentHost = appendVisible(document.createElement('div'));
    const contentRoot = contentHost.attachShadow({ mode: 'open' });
    initializeContentUiRoots(contentRoot);
    const contentButton = appendVisible(document.createElement('button'), contentRoot);
    const lookalike = appendVisible(document.createElement('button'));
    lookalike.className = 'sniptale-page-style-inspector-control';
    lookalike.dataset['ui'] = 'content.pageStyleInspector.control';

    expect(isPageStyleMutationElement(contentHost)).toBe(false);
    expect(isPageStyleMutationElement(contentButton)).toBe(false);
    expect(isPageStyleMutationElement(lookalike)).toBe(true);
  });

  it('rejects HTML metadata, SMIL, SVG resources, and non-rendered targets', () => {
    const script = appendVisible(document.createElement('script'));
    const template = appendVisible(document.createElement('template'));
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    const animate = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
    defs.append(gradient);
    svg.append(defs, animate);
    appendVisible(svg);
    appendVisible(defs, svg);
    appendVisible(gradient, defs);
    appendVisible(animate, svg);
    const hidden = appendVisible(document.createElement('div'));
    hidden.style.display = 'none';

    expect(
      [script, template, defs, gradient, animate, hidden].some(isPageStyleMutationElement)
    ).toBe(false);
  });
});
