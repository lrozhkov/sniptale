// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  measurePageScrollGeometry,
  readPageScroll,
  resolvePageScrollRoot,
  writePageScroll,
} from '.';

function defineBox(
  element: HTMLElement,
  values: {
    clientHeight: number;
    clientWidth: number;
    scrollHeight: number;
    scrollWidth: number;
  }
) {
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(element, key, { configurable: true, value });
  }
}

function useDocumentRoot(): HTMLElement {
  const root = document.documentElement;
  Object.defineProperty(document, 'scrollingElement', { configurable: true, value: root });
  return root;
}

beforeEach(() => {
  Object.defineProperties(window, {
    innerHeight: { configurable: true, value: 600 },
    innerWidth: { configurable: true, value: 800 },
  });
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it('resolves and measures a scrolling document root', () => {
  const root = useDocumentRoot();
  defineBox(root, { clientHeight: 600, clientWidth: 800, scrollHeight: 1_600, scrollWidth: 800 });

  const resolved = resolvePageScrollRoot();

  expect(resolved).toEqual({ element: root, kind: 'document' });
  expect(measurePageScrollGeometry(resolved)).toEqual({
    extentHeight: 1_600,
    extentWidth: 800,
    viewportHeight: 600,
    viewportWidth: 800,
  });
});

it('preserves document-element extent when body is the scrolling element', () => {
  const body = document.body;
  const documentElement = document.documentElement;
  Object.defineProperty(document, 'scrollingElement', { configurable: true, value: body });
  defineBox(documentElement, {
    clientHeight: 600,
    clientWidth: 800,
    scrollHeight: 2_000,
    scrollWidth: 900,
  });
  defineBox(body, {
    clientHeight: 600,
    clientWidth: 800,
    scrollHeight: 1_000,
    scrollWidth: 800,
  });

  const root = resolvePageScrollRoot();

  expect(root).toEqual({ element: body, kind: 'document' });
  expect(measurePageScrollGeometry(root)).toEqual({
    extentHeight: 2_000,
    extentWidth: 900,
    viewportHeight: 600,
    viewportWidth: 800,
  });
});

it('resolves, measures, reads, and writes one dominant internal scroller', () => {
  const documentRoot = useDocumentRoot();
  defineBox(documentRoot, {
    clientHeight: 600,
    clientWidth: 800,
    scrollHeight: 600,
    scrollWidth: 800,
  });
  const scroller = document.createElement('div');
  scroller.style.overflowY = 'auto';
  defineBox(scroller, {
    clientHeight: 400,
    clientWidth: 700,
    scrollHeight: 1_600,
    scrollWidth: 700,
  });
  vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({
    bottom: 500,
    height: 400,
    left: 50,
    right: 750,
    top: 100,
    width: 700,
    x: 50,
    y: 100,
    toJSON: () => ({}),
  });
  const scrollTo = vi.fn((options: ScrollToOptions) => {
    if (typeof options === 'object') {
      scroller.scrollLeft = Number(options.left ?? 0);
      scroller.scrollTop = Number(options.top ?? 0);
    }
  });
  Object.defineProperty(scroller, 'scrollTo', { configurable: true, value: scrollTo });
  document.body.append(scroller);

  const resolved = resolvePageScrollRoot();
  expect(resolved).toEqual({ element: scroller, kind: 'element' });
  expect(measurePageScrollGeometry(resolved)).toEqual({
    extentHeight: 1_600,
    extentWidth: 700,
    viewportHeight: 400,
    viewportWidth: 700,
  });

  writePageScroll(resolved, 12, 340);
  expect(scrollTo).toHaveBeenCalledWith({ behavior: 'instant', left: 12, top: 340 });
  expect(readPageScroll(resolved)).toEqual({ x: 12, y: 340 });
});

it('fails closed for comparable independent internal scrollers', () => {
  const documentRoot = useDocumentRoot();
  defineBox(documentRoot, {
    clientHeight: 600,
    clientWidth: 800,
    scrollHeight: 600,
    scrollWidth: 800,
  });
  for (const left of [0, 400]) {
    const scroller = document.createElement('div');
    scroller.style.overflowY = 'auto';
    defineBox(scroller, {
      clientHeight: 600,
      clientWidth: 400,
      scrollHeight: 1_200,
      scrollWidth: 400,
    });
    vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({
      bottom: 600,
      height: 600,
      left,
      right: left + 400,
      top: 0,
      width: 400,
      x: left,
      y: 0,
      toJSON: () => ({}),
    });
    document.body.append(scroller);
  }

  expect(() => resolvePageScrollRoot()).toThrow(
    'unsupported-layout: multiple independent scroll containers'
  );
});
