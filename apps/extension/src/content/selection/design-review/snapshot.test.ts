// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import {
  browserAnnotationSession,
  createBrowserAnnotationTargetEvidence,
} from '../../parser/page-preparation/annotations';
import { findInspectablePageStyleElement, readPageStyleSelectionSnapshot } from './snapshot';

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
  browserAnnotationSession.resetForDocument();
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

it('omits transient Sniptale classes from the readable target path', () => {
  document.body.className = 'page-shell sniptale-navigation-locked';
  const target = appendVisible(document.createElement('p'));

  expect(readPageStyleSelectionSnapshot(target)).toMatchObject({
    domPath: 'html > body.page-shell > p:nth-of-type(1)',
  });
});

it('does not climb from an ineligible target to a selectable ancestor', () => {
  const wrapper = appendVisible(document.createElement('div'));
  const script = appendVisible(document.createElement('script'), wrapper);

  expect(findInspectablePageStyleElement(script)).toBeNull();
});

it.each(['50%', 'calc(50% - 2px)', '10em'])(
  'keeps accepted authored width %s when browser computed style resolves pixels',
  (width) => {
    const element = appendVisible(document.createElement('p'));
    element.style.width = width;
    browserAnnotationSession.recordPropertyChanges({
      target: element,
      evidence: createBrowserAnnotationTargetEvidence(element),
      changes: [
        {
          property: 'width',
          before: { value: '', priority: '' },
          after: { value: element.style.width, priority: '' },
          order: 1,
        },
      ],
    });
    const computed = document.createElement('div').style;
    computed.width = '200px';
    computed.height = '40px';
    vi.spyOn(window, 'getComputedStyle').mockReturnValue(computed);
    const before = element.outerHTML;
    const snapshot = readPageStyleSelectionSnapshot(element)!;
    expect(snapshot.patch.declarations.find((item) => item.property === 'width')?.value).toBe(
      element.style.width
    );
    expect(snapshot.patch.declarations.find((item) => item.property === 'height')?.value).toBe(
      '40px'
    );
    expect(element.outerHTML).toBe(before);
    element.style.setProperty('width', width, 'important');
    expect(
      readPageStyleSelectionSnapshot(element)!.patch.declarations.find(
        (item) => item.property === 'width'
      )?.value
    ).toBe('200px');
    element.style.setProperty('width', width, '');
    browserAnnotationSession.resetForDocument();
    expect(
      readPageStyleSelectionSnapshot(element)!.patch.declarations.find(
        (item) => item.property === 'width'
      )?.value
    ).toBe('200px');
    element.style.width = '320px';
    computed.width = '320px';
    expect(
      readPageStyleSelectionSnapshot(element)!.patch.declarations.find(
        (item) => item.property === 'width'
      )?.value
    ).toBe('320px');
    element.style.removeProperty('width');
    computed.width = '200px';
    expect(
      readPageStyleSelectionSnapshot(element)!.patch.declarations.find(
        (item) => item.property === 'width'
      )?.value
    ).toBe('200px');
  }
);

it('keeps computed visual values for original variables and overridden original dimensions', () => {
  const element = appendVisible(document.createElement('p'));
  element.style.color = 'var(--brand)';
  element.style.fontFamily = 'var(--family)';
  element.style.width = '50%';
  const computed = document.createElement('div').style;
  computed.color = 'rgb(12, 34, 56)';
  computed.fontFamily = 'Arial';
  computed.width = '400px';
  vi.spyOn(window, 'getComputedStyle').mockReturnValue(computed);
  const values = readPageStyleSelectionSnapshot(element)!.patch.declarations;
  expect(values.find((item) => item.property === 'color')?.value).toBe('rgb(12, 34, 56)');
  expect(values.find((item) => item.property === 'font-family')?.value).toBe('Arial');
  expect(values.find((item) => item.property === 'width')?.value).toBe('400px');
});
