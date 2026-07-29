// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { measureAnchorVisibility } from './visibility';

function installRect(element: HTMLElement, rect: DOMRectInit) {
  const resolved = DOMRect.fromRect(rect);
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(resolved);
  vi.spyOn(element, 'getClientRects').mockReturnValue(createRectList(resolved));
}

function createRectList(...rects: DOMRect[]): DOMRectList {
  const list: DOMRectList = {
    [Symbol.iterator]: () => rects[Symbol.iterator](),
    item: (index) => rects[index] ?? null,
    length: rects.length,
  };
  rects.forEach((rect, index) => Object.defineProperty(list, index, { value: rect }));
  return list;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('anchor visibility gate', () => {
  it.each([
    ['display', 'none'],
    ['visibility', 'hidden'],
    ['contentVisibility', 'hidden'],
    ['opacity', '0'],
  ] as const)('suspends an anchor hidden by %s', (property, value) => {
    const target = document.createElement('button');
    Object.assign(target.style, { [property]: value });
    document.body.appendChild(target);
    installRect(target, { x: 20, y: 30, width: 100, height: 40 });

    expect(measureAnchorVisibility(target).presentation).toBe('suspended');
  });

  it('suspends aria-hidden, empty, and non-finite layout boxes', () => {
    const target = document.createElement('button');
    document.body.appendChild(target);
    target.setAttribute('aria-hidden', 'true');
    installRect(target, { x: 20, y: 30, width: 100, height: 40 });
    expect(measureAnchorVisibility(target).presentation).toBe('suspended');

    target.removeAttribute('aria-hidden');
    vi.restoreAllMocks();
    vi.spyOn(target, 'getClientRects').mockReturnValue(createRectList());
    expect(measureAnchorVisibility(target).reason).toBe('missing-layout-box');

    vi.restoreAllMocks();
    installRect(target, { x: Number.NaN, y: 30, width: 100, height: 40 });
    expect(measureAnchorVisibility(target).reason).toBe('invalid-layout-box');
  });

  it('distinguishes carousel clipping from ordinary viewport scroll', () => {
    const viewport = document.createElement('div');
    viewport.style.overflow = 'hidden';
    const target = document.createElement('button');
    viewport.appendChild(target);
    document.body.appendChild(viewport);
    installRect(viewport, { x: 0, y: 0, width: 300, height: 100 });
    installRect(target, { x: -250, y: 20, width: 100, height: 40 });
    expect(measureAnchorVisibility(target).presentation).toBe('suspended');

    viewport.style.overflow = 'visible';
    vi.restoreAllMocks();
    installRect(viewport, { x: 0, y: 0, width: 300, height: 100 });
    installRect(target, { x: -500, y: 20, width: 100, height: 40 });
    expect(measureAnchorVisibility(target).presentation).toBe('offscreen');
  });

  it('applies hidden and clipping gates through the containing iframe chain', () => {
    const outer = document.createElement('div');
    const iframe = document.createElement('iframe');
    outer.appendChild(iframe);
    document.body.appendChild(outer);
    const target = iframe.contentDocument!.createElement('button');
    iframe.contentDocument!.body.appendChild(target);
    installRect(iframe, { x: 100, y: 80, width: 300, height: 200 });
    installRect(outer, { x: 90, y: 70, width: 340, height: 240 });
    installRect(target, { x: 20, y: 20, width: 100, height: 40 });

    iframe.style.visibility = 'hidden';
    expect(measureAnchorVisibility(target).presentation).toBe('suspended');

    iframe.style.visibility = 'visible';
    outer.style.overflow = 'hidden';
    installRect(outer, { x: 90, y: 70, width: 50, height: 240 });
    expect(measureAnchorVisibility(target).presentation).toBe('suspended');
  });
});
