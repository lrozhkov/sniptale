// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeContentUiRoots } from '../../platform/dom-host';
import { resolveSelectablePageElement, resolveSelectablePageHtmlElement } from '.';

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
});
