// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeContentUiRoots } from '../../platform/dom-host';
import {
  resolveDrawablePageHtmlElement,
  resolveSelectablePageElement,
  resolveSelectablePageHtmlElement,
} from '.';

function makeVisible<T extends Element>(element: T): T {
  const rect = DOMRect.fromRect({ height: 32, width: 96, x: 20, y: 30 });
  Object.defineProperty(element, 'getClientRects', {
    configurable: true,
    value: () => ({
      0: rect,
      [Symbol.iterator]: () => [rect][Symbol.iterator](),
      item: (index: number) => (index === 0 ? rect : null),
      length: 1,
    }),
  });
  return element;
}

function createRectList(rect: DOMRect): DOMRectList {
  return {
    0: rect,
    [Symbol.iterator]: () => [rect][Symbol.iterator](),
    item: (index) => (index === 0 ? rect : null),
    length: 1,
  };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('shared selectable page element target', () => {
  it('resolves the exact rendered element through an open shadow composed path', () => {
    const host = makeVisible(document.createElement('article'));
    const target = makeVisible(document.createElement('button'));
    host.attachShadow({ mode: 'open' }).append(target);
    document.body.append(host);

    let resolvedElement: Element | null = null;
    let resolvedHtmlElement: HTMLElement | null = null;
    window.addEventListener(
      'mousemove',
      (event) => {
        resolvedElement = resolveSelectablePageElement(event);
        resolvedHtmlElement = resolveSelectablePageHtmlElement(event);
      },
      { capture: true, once: true }
    );
    const event = new MouseEvent('mousemove', { bubbles: true, composed: true });
    target.dispatchEvent(event);

    expect(resolvedElement).toBe(target);
    expect(resolvedHtmlElement).toBe(target);
  });

  it('uses the visible label proxy when the direct form control is not rendered', () => {
    const input = makeVisible(document.createElement('input'));
    input.id = 'language-toggle';
    input.style.opacity = '0';
    const label = makeVisible(document.createElement('label'));
    label.htmlFor = input.id;
    document.body.append(input, label);

    const event = new MouseEvent('click', { bubbles: true, composed: true });
    input.dispatchEvent(event);

    expect(resolveSelectablePageElement(event)).toBe(label);
    expect(resolveSelectablePageHtmlElement(event)).toBe(label);
  });

  it('walks to the first rendered ancestor and rejects extension-owned composed paths', () => {
    const parent = makeVisible(document.createElement('section'));
    const hidden = makeVisible(document.createElement('span'));
    hidden.style.display = 'none';
    parent.append(hidden);
    document.body.append(parent);
    const pageEvent = new MouseEvent('mousemove', { bubbles: true, composed: true });
    hidden.dispatchEvent(pageEvent);

    expect(resolveSelectablePageElement(pageEvent)).toBe(parent);

    const host = document.createElement('div');
    const contentRoot = host.attachShadow({ mode: 'open' });
    initializeContentUiRoots(contentRoot);
    const control = makeVisible(document.createElement('button'));
    contentRoot.append(control);
    document.body.append(host);
    const ownedEvent = new MouseEvent('mousemove', { bubbles: true, composed: true });
    control.dispatchEvent(ownedEvent);

    expect(resolveSelectablePageElement(ownedEvent)).toBeNull();
  });

  it('keeps SVG exact for Design Review and projects Annotation to its HTML container', () => {
    const container = makeVisible(document.createElement('figure'));
    const svg = makeVisible(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    const path = makeVisible(document.createElementNS('http://www.w3.org/2000/svg', 'path'));
    svg.append(path);
    container.append(svg);
    document.body.append(container);
    const event = new MouseEvent('mousemove', { bubbles: true, composed: true });
    path.dispatchEvent(event);

    expect(resolveSelectablePageElement(event)).toBe(path);
    expect(resolveSelectablePageHtmlElement(event)).toBe(container);
  });

  it('projects open-shadow SVG to its selectable HTML host through the composed tree', () => {
    const host = makeVisible(document.createElement('article'));
    const svg = makeVisible(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    const path = makeVisible(document.createElementNS('http://www.w3.org/2000/svg', 'path'));
    svg.append(path);
    host.attachShadow({ mode: 'open' }).append(svg);
    document.body.append(host);
    let resolvedElement: Element | null = null;
    let resolvedHtmlElement: HTMLElement | null = null;
    window.addEventListener(
      'mousemove',
      (event) => {
        resolvedElement = resolveSelectablePageElement(event);
        resolvedHtmlElement = resolveSelectablePageHtmlElement(event);
      },
      { capture: true, once: true }
    );

    path.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, composed: true }));

    expect(resolvedElement).toBe(path);
    expect(resolvedHtmlElement).toBe(host);
  });

  it('rejects document roots for Annotation without changing the shared element resolver', () => {
    makeVisible(document.documentElement);
    makeVisible(document.body);

    const bodyEvent = new MouseEvent('mousemove', { bubbles: true, composed: true });
    document.body.dispatchEvent(bodyEvent);
    expect(resolveSelectablePageElement(bodyEvent)).toBe(document.body);
    expect(resolveSelectablePageHtmlElement(bodyEvent)).toBeNull();
    expect(resolveDrawablePageHtmlElement(bodyEvent)).toBe(document.body);

    const htmlEvent = new MouseEvent('mousemove', { bubbles: true, composed: true });
    document.documentElement.dispatchEvent(htmlEvent);
    expect(resolveSelectablePageElement(htmlEvent)).toBe(document.documentElement);
    expect(resolveSelectablePageHtmlElement(htmlEvent)).toBeNull();
    expect(resolveDrawablePageHtmlElement(htmlEvent)).toBe(document.documentElement);
  });

  it('requires an Annotation target to intersect its viewport but allows partial visibility', () => {
    const offscreen = makeVisible(document.createElement('section'));
    const partiallyVisible = makeVisible(document.createElement('article'));
    const offscreenRect = DOMRect.fromRect({
      height: 80,
      width: 120,
      x: window.innerWidth + 20,
      y: 40,
    });
    const partialRect = DOMRect.fromRect({
      height: window.innerHeight * 2,
      width: 160,
      x: 20,
      y: -40,
    });
    vi.spyOn(offscreen, 'getClientRects').mockReturnValue(createRectList(offscreenRect));
    vi.spyOn(partiallyVisible, 'getClientRects').mockReturnValue(createRectList(partialRect));
    document.body.append(offscreen, partiallyVisible);

    const offscreenEvent = new MouseEvent('mousemove', { bubbles: true, composed: true });
    offscreen.dispatchEvent(offscreenEvent);
    expect(resolveSelectablePageHtmlElement(offscreenEvent)).toBeNull();

    const partialEvent = new MouseEvent('mousemove', { bubbles: true, composed: true });
    partiallyVisible.dispatchEvent(partialEvent);
    expect(resolveSelectablePageHtmlElement(partialEvent)).toBe(partiallyVisible);
  });
});
