// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resolvePageScrollRoot } from '../../platform/page-scroll';
import { measureCaptureGeometry } from './geometry';

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

it('prefers the document root whenever either document axis scrolls', () => {
  const root = useDocumentRoot();
  defineBox(root, { clientHeight: 600, clientWidth: 800, scrollHeight: 600, scrollWidth: 1200 });

  expect(resolvePageScrollRoot()).toEqual({ element: root, kind: 'document' });
});

it('selects one dominant internal scroller and composes shell plus full content dimensions', () => {
  const documentRoot = useDocumentRoot();
  defineBox(documentRoot, {
    clientHeight: 600,
    clientWidth: 800,
    scrollHeight: 600,
    scrollWidth: 800,
  });
  const scroller = document.createElement('div');
  scroller.style.overflowX = 'auto';
  scroller.style.overflowY = 'auto';
  defineBox(scroller, {
    clientHeight: 400,
    clientWidth: 700,
    scrollHeight: 1_600,
    scrollWidth: 700,
  });
  Object.defineProperties(scroller, {
    clientLeft: { configurable: true, value: 2 },
    clientTop: { configurable: true, value: 2 },
  });
  vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({
    bottom: 502,
    height: 404,
    left: 48,
    right: 752,
    top: 98,
    width: 704,
    x: 48,
    y: 98,
    toJSON: () => ({}),
  });
  document.body.append(scroller);

  const root = resolvePageScrollRoot();
  expect(root).toEqual({ element: scroller, kind: 'element' });
  expect(measureCaptureGeometry(root)).toEqual(
    expect.objectContaining({
      extentHeight: 1_600,
      extentWidth: 700,
      outputHeight: 1_800,
      outputWidth: 800,
      rootViewport: { height: 400, width: 700, x: 50, y: 100 },
    })
  );
});

it('captures a dominant internal scroller vertically without expanding a hostile horizontal extent', () => {
  const documentRoot = useDocumentRoot();
  defineBox(documentRoot, {
    clientHeight: 600,
    clientWidth: 800,
    scrollHeight: 600,
    scrollWidth: 800,
  });
  const scroller = document.createElement('div');
  scroller.style.overflowX = 'auto';
  scroller.style.overflowY = 'auto';
  defineBox(scroller, {
    clientHeight: 500,
    clientWidth: 760,
    scrollHeight: 2_400,
    scrollWidth: 50_000,
  });
  Object.defineProperties(scroller, {
    clientLeft: { configurable: true, value: 0 },
    clientTop: { configurable: true, value: 0 },
  });
  vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({
    bottom: 550,
    height: 500,
    left: 20,
    right: 780,
    top: 50,
    width: 760,
    x: 20,
    y: 50,
    toJSON: () => ({}),
  });
  document.body.append(scroller);

  const geometry = measureCaptureGeometry(resolvePageScrollRoot());

  expect(geometry).toEqual(
    expect.objectContaining({
      extentHeight: 2_400,
      extentWidth: 760,
      outputHeight: 2_500,
      outputWidth: 800,
      rootKind: 'element',
    })
  );
});

it('fails closed when two independent internal scrollers have comparable scores', () => {
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

  expect(() => resolvePageScrollRoot()).toThrow('multiple independent scroll containers');
});
