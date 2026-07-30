// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import { findInspectablePageStyleElement, readPageStyleSelectionSnapshot } from './properties';

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

it('creates Properties snapshots for visible HTML and SVG targets', () => {
  const html = appendVisible(document.createElement('section'));
  html.id = 'html-target';
  html.textContent = 'HTML target';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.id = 'svg-target';
  text.textContent = 'SVG target';
  svg.append(text);
  document.body.append(svg);
  appendVisible(text, svg);

  expect(readPageStyleSelectionSnapshot(html)).toMatchObject({
    element: html,
    tagName: 'section',
  });
  expect(readPageStyleSelectionSnapshot(text)).toMatchObject({
    element: text,
    tagName: 'text',
  });
  expect(findInspectablePageStyleElement(text)).toBe(text);
});

it('addresses an inner same-origin iframe target and the iframe element itself', () => {
  const iframe = appendVisible(document.createElement('iframe'));
  iframe.id = 'frame';
  const iframeDocument = iframe.contentDocument;
  if (!iframeDocument) throw new Error('Expected iframe document');
  const inner = appendVisible(iframeDocument.createElement('button'), iframeDocument.body);
  inner.id = 'inner';
  inner.textContent = 'Inner';

  expect(readPageStyleSelectionSnapshot(inner)).toMatchObject({
    element: inner,
    tagName: 'button',
  });
  expect(readPageStyleSelectionSnapshot(iframe)).toMatchObject({
    element: iframe,
    tagName: 'iframe',
  });
});

it('does not climb from an ineligible target to a selectable ancestor', () => {
  const wrapper = appendVisible(document.createElement('div'));
  const script = appendVisible(document.createElement('script'), wrapper);

  expect(findInspectablePageStyleElement(script)).toBeNull();
});
