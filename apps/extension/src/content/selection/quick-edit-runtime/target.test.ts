// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveQuickEditTextTarget } from './target';

function makeVisible<T extends Element>(element: T): T {
  const rect = DOMRect.fromRect({ height: 24, width: 80, x: 10, y: 12 });
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

function createEvent(target: Element, type = 'mousemove'): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, composed: true });
  target.dispatchEvent(event);
  return event;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('Quick Edit text target hierarchy', () => {
  it('selects the nearest meaningful text block instead of a broad root container', () => {
    const root = makeVisible(document.createElement('main'));
    const container = makeVisible(document.createElement('div'));
    const paragraph = makeVisible(document.createElement('p'));
    const emphasis = makeVisible(document.createElement('strong'));
    emphasis.textContent = 'Editable copy';
    paragraph.append(emphasis);
    container.append(paragraph);
    root.append(container);
    document.body.append(root);

    expect(resolveQuickEditTextTarget(createEvent(emphasis))).toBe(paragraph);
  });

  it('does not select a broad div that owns multiple text blocks', () => {
    const container = makeVisible(document.createElement('div'));
    const first = makeVisible(document.createElement('p'));
    const second = makeVisible(document.createElement('p'));
    first.textContent = 'First';
    second.textContent = 'Second';
    container.append(first, second);
    document.body.append(container);

    expect(resolveQuickEditTextTarget(createEvent(container))).toBeNull();
  });

  it('does not select a broad div that owns nested div text blocks', () => {
    const container = makeVisible(document.createElement('div'));
    const first = makeVisible(document.createElement('div'));
    const second = makeVisible(document.createElement('div'));
    first.textContent = 'First';
    second.textContent = 'Second';
    container.append(first, second);
    document.body.append(container);

    expect(resolveQuickEditTextTarget(createEvent(container))).toBeNull();
  });

  it('does not climb from an image to a text-bearing ancestor', () => {
    const paragraph = makeVisible(document.createElement('p'));
    const image = makeVisible(document.createElement('img'));
    const text = document.createTextNode('Caption beside the image');
    paragraph.append(image, text);
    document.body.append(paragraph);

    expect(resolveQuickEditTextTarget(createEvent(image))).toBeNull();
  });

  it('crosses an open ShadowRoot but keeps the nearest text block inside it', () => {
    const host = makeVisible(document.createElement('article'));
    const paragraph = makeVisible(document.createElement('p'));
    const emphasis = makeVisible(document.createElement('strong'));
    emphasis.textContent = 'Shadow copy';
    paragraph.append(emphasis);
    host.attachShadow({ mode: 'open' }).append(paragraph);
    document.body.append(host);
    let resolved: HTMLElement | null = null;
    window.addEventListener(
      'mousemove',
      (event) => {
        resolved = resolveQuickEditTextTarget(event);
      },
      { capture: true, once: true }
    );

    emphasis.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, composed: true }));

    expect(resolved).toBe(paragraph);
  });

  it('selects a text link through nested inline markup and ignores empty elements', () => {
    const link = makeVisible(document.createElement('a'));
    link.href = '/next';
    const emphasis = makeVisible(document.createElement('strong'));
    emphasis.textContent = 'Open details';
    link.append(emphasis);
    const empty = makeVisible(document.createElement('span'));
    document.body.append(link, empty);

    expect(resolveQuickEditTextTarget(createEvent(emphasis))).toBe(link);
    expect(resolveQuickEditTextTarget(createEvent(empty))).toBeNull();
  });
});
