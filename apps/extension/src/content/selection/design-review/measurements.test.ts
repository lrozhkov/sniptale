// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  createDesignReviewMeasurements,
  measureDesignReviewLayout,
  measureDesignReviewNeighbors,
} from './measurements';

function box(x: number, y: number, width = 50, height = 50, parent: Element = document.body) {
  const element = document.createElement('div');
  let rect = new DOMRect(x, y, width, height);
  element.getBoundingClientRect = () => rect;
  element.getClientRects = () => ({
    0: rect,
    length: 1,
    item: () => rect,
    [Symbol.iterator]: () => [rect][Symbol.iterator](),
  });
  parent.append(element);
  return {
    element,
    move: (next: DOMRect) => {
      rect = next;
    },
  };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it('chooses the nearest sibling on each axis and ignores diagonal, overlapping, hidden and nested boxes', () => {
  const target = box(100, 100);
  box(180, 100);
  box(160, 110);
  box(20, 100);
  box(100, 30);
  box(100, 170);
  box(170, 170);
  box(110, 110);
  box(150, 100).element.style.visibility = 'hidden';
  box(150, 100, 0, 50);
  box(150, 100, 50, 50, target.element);
  expect(
    measureDesignReviewNeighbors(target.element).map(({ direction, distance }) => [
      direction,
      distance,
    ])
  ).toEqual([
    ['right', 10],
    ['left', 30],
    ['top', 20],
    ['bottom', 20],
  ]);
});

it('includes touching edges and excludes offscreen or detached targets', () => {
  const target = box(100, 100);
  box(150, 100);
  box(-100, 100);
  box(100, -100);
  expect(measureDesignReviewNeighbors(target.element)).toMatchObject([
    { direction: 'right', distance: 0 },
  ]);
  target.element.remove();
  expect(measureDesignReviewNeighbors(target.element)).toEqual([]);
});

it('keeps DOM-order ties deterministic and emits no rulers without neighbors', () => {
  const target = box(100, 100);
  expect(measureDesignReviewNeighbors(target.element)).toEqual([]);
  box(170, 100, 50, 10);
  box(170, 130, 50, 10);
  expect(measureDesignReviewNeighbors(target.element)).toMatchObject([{ distance: 20, y1: 105 }]);
});

it('measures free space inside the parent and viewport even without siblings', () => {
  const parent = box(80, 60, 300, 240).element;
  const target = box(120, 110, 50, 40, parent).element;
  const layout = measureDesignReviewLayout(target);
  expect(
    layout
      .filter(({ scope }) => scope === 'container')
      .map(({ direction, distance }) => [direction, distance])
  ).toEqual([
    ['left', 40],
    ['right', 210],
    ['top', 50],
    ['bottom', 150],
  ]);
  expect(layout.filter(({ scope }) => scope === 'viewport')).toHaveLength(4);
});

it('refreshes stationary hover after layout changes and removes rulers on leave, disable and disposal', () => {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  const cancel = vi.spyOn(window, 'cancelAnimationFrame');
  const target = box(100, 100);
  const sibling = box(180, 100);
  const runtime = createDesignReviewMeasurements();
  runtime.hover(target.element);
  const layer = () =>
    document.querySelector<HTMLElement>('[data-ui="content.design-review.measurements"]');
  expect(layer()).toBeNull();
  runtime.setEnabled(true);
  expect(layer()?.textContent).toBe('30 px');
  expect(layer()?.style.pointerEvents).toBe('none');
  expect(layer()?.dataset['floatingUiCaptureTransient']).toBe('true');
  expect(layer()?.style.scale).toBe('none');
  sibling.move(new DOMRect(200, 100, 50, 50));
  frames.shift()?.(0);
  expect(layer()?.textContent).toBe('50 px');
  runtime.hover(null);
  expect(layer()).toBeNull();
  runtime.hover(target.element);
  expect(layer()?.textContent).toBe('50 px');
  runtime.setEnabled(false);
  expect(layer()).toBeNull();
  runtime.setEnabled(true);
  runtime.dispose();
  expect(layer()).toBeNull();
  expect(cancel).toHaveBeenCalled();
});

it('adds viewport guides and a container outline only in expanded mode', () => {
  const parent = box(80, 60, 300, 240).element;
  const target = box(120, 110, 50, 40, parent).element;
  const runtime = createDesignReviewMeasurements();
  runtime.hover(target);
  runtime.setEnabled(true);
  const layer = () =>
    document.querySelector<HTMLElement>('[data-ui="content.design-review.measurements"]');
  expect(layer()?.querySelector('[data-scope="viewport"]')).toBeNull();

  runtime.setExpanded(true);
  expect(layer()?.querySelectorAll('[data-scope="viewport"]')).toHaveLength(4);
  expect(layer()?.querySelectorAll('[data-scope="container"]')).toHaveLength(4);
  expect(layer()?.textContent).toMatch(/Parent|Контейнер/u);
  expect(layer()?.textContent).toMatch(/Viewport|Экран/u);
  expect(layer()?.querySelectorAll('[data-scope="guide-horizontal"]')).toHaveLength(2);
  expect(layer()?.querySelectorAll('[data-scope="guide-vertical"]')).toHaveLength(2);
  expect(layer()?.querySelector('[data-scope="container-outline"]')).not.toBeNull();
  expect(layer()?.style.pointerEvents).toBe('none');

  runtime.setExpanded(false);
  expect(layer()?.querySelector('[data-scope="viewport"]')).toBeNull();
  runtime.dispose();
});

it('excludes fully overflow-clipped siblings but measures the original bounds of partially visible ones', () => {
  const parent = box(100, 100, 100, 100).element;
  // jsdom does not expand the overflow shorthand into computed axis values.
  parent.style.overflowX = 'hidden';
  parent.style.overflowY = 'hidden';
  const target = box(110, 110, 40, 40, parent);
  const sibling = box(220, 110, 40, 40, parent);
  expect(measureDesignReviewNeighbors(target.element)).toEqual([]);
  sibling.move(new DOMRect(180, 110, 40, 40));
  expect(measureDesignReviewNeighbors(target.element)).toMatchObject([
    { direction: 'right', distance: 30 },
  ]);
  parent.style.overflowX = 'visible';
  parent.style.overflowY = 'visible';
  sibling.move(new DOMRect(220, 110, 40, 40));
  expect(measureDesignReviewNeighbors(target.element)).toMatchObject([
    { direction: 'right', distance: 70 },
  ]);
});

it('applies clipping per axis through nested scroll containers', () => {
  const outer = box(100, 100, 100, 100).element;
  outer.style.overflowX = 'hidden';
  const inner = box(100, 100, 300, 300, outer).element;
  const target = box(110, 110, 40, 40, inner);
  box(220, 110, 40, 40, inner);
  box(110, 220, 40, 40, inner);
  expect(measureDesignReviewNeighbors(target.element)).toMatchObject([
    { direction: 'bottom', distance: 70 },
  ]);
  outer.style.overflowY = 'auto';
  expect(measureDesignReviewNeighbors(target.element)).toEqual([]);
});

it('honors a clipping shadow host and hidden ancestors', () => {
  const host = box(100, 100, 100, 100).element;
  host.style.overflowX = 'hidden';
  host.style.overflowY = 'hidden';
  const root = host.attachShadow({ mode: 'open' });
  const inner = document.createElement('div');
  root.append(inner);
  const target = box(110, 110, 40, 40, inner);
  box(220, 110, 40, 40, inner);
  expect(measureDesignReviewNeighbors(target.element)).toEqual([]);
  host.style.overflowX = 'visible';
  host.style.overflowY = 'visible';
  expect(measureDesignReviewNeighbors(target.element)).toHaveLength(1);
  host.style.opacity = '0';
  expect(measureDesignReviewNeighbors(target.element)).toEqual([]);
});

it('projects accessible iframe distances and excludes siblings clipped by the frame', () => {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  iframe.getBoundingClientRect = () => new DOMRect(200, 200, 100, 100);
  const body = iframe.contentDocument!.body;
  const target = box(10, 10, 40, 40, body);
  const neighbor = box(120, 10, 40, 40, body);
  expect(measureDesignReviewNeighbors(target.element)).toEqual([]);
  neighbor.move(new DOMRect(70, 10, 40, 40));
  expect(measureDesignReviewNeighbors(target.element)).toMatchObject([
    { direction: 'right', distance: 20, x1: 250, x2: 270, y1: 230 },
  ]);
});

it('keeps actual long label boxes disjoint around a tiny selected element', () => {
  const original = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      if (this.tagName !== 'SPAN') return original.call(this);
      return new DOMRect(
        Number.parseFloat(this.style.left) || 0,
        Number.parseFloat(this.style.top) || 0,
        130,
        20
      );
    }
  );
  const parent = box(499, 299, 4, 4).element;
  const target = box(500, 300, 2, 2, parent).element;
  const runtime = createDesignReviewMeasurements();
  runtime.hover(target);
  runtime.setEnabled(true);
  runtime.setExpanded(true);
  const labels = Array.from(
    document.querySelectorAll<HTMLElement>('[data-ui="content.design-review.measurements"] span')
  ).filter((label) => !label.hidden);
  expect(labels.length).toBeGreaterThan(4);
  const rectangles = labels.map((label) => label.getBoundingClientRect());
  for (let i = 0; i < rectangles.length; i += 1) {
    const a = rectangles[i]!;
    for (const b of rectangles.slice(i + 1)) {
      expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(
        true
      );
    }
  }
  runtime.dispose();
});

it.each([
  [false, false],
  [true, false],
  [false, true],
  [true, true],
])('renders independent sibling=%s and additional=%s projections', (basic, additional) => {
  const parent = box(80, 60, 300, 240).element;
  const target = box(120, 110, 50, 40, parent).element;
  box(200, 110, 50, 40, parent);
  const runtime = createDesignReviewMeasurements();
  runtime.hover(target);
  runtime.setEnabled(basic);
  runtime.setExpanded(additional);
  const layer = document.querySelector('[data-ui="content.design-review.measurements"]');
  expect(Boolean(layer)).toBe(basic || additional);
  expect(layer?.querySelectorAll('[data-scope="neighbor"]').length ?? 0).toBe(basic ? 1 : 0);
  expect(layer?.querySelectorAll('[data-scope="container"]').length ?? 0).toBe(additional ? 4 : 0);
  expect(layer?.querySelectorAll('[data-scope="viewport"]').length ?? 0).toBe(additional ? 4 : 0);
  expect(Boolean(layer?.querySelector('[data-scope="container-outline"]'))).toBe(additional);
  runtime.dispose();
});

it('deduplicates coincident container and viewport rulers without merging different positions', () => {
  const parent = box(0, 0, window.innerWidth, window.innerHeight).element;
  const target = box(100, 100, 50, 50, parent).element;
  const runtime = createDesignReviewMeasurements();
  runtime.hover(target);
  runtime.setExpanded(true);
  const layer = document.querySelector('[data-ui="content.design-review.measurements"]');
  expect(layer?.querySelectorAll('[data-scope="container"]')).toHaveLength(4);
  expect(layer?.querySelectorAll('[data-scope="viewport"]')).toHaveLength(0);
  runtime.dispose();
});

it('tracks layout changes with additional distances alone and releases every scheduled frame', () => {
  const callbacks: FrameRequestCallback[] = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callbacks.push(callback);
    return callbacks.length;
  });
  const target = box(100, 100);
  const runtime = createDesignReviewMeasurements();
  runtime.hover(target.element);
  runtime.setExpanded(true);
  expect(callbacks).toHaveLength(1);
  const layer = () => document.querySelector('[data-ui="content.design-review.measurements"]');
  expect(
    layer()?.querySelector('[data-scope="viewport"][data-direction="left"]')?.textContent
  ).toMatch(/100 px/u);
  target.move(new DOMRect(120, 100, 50, 50));
  callbacks.shift()?.(0);
  expect(
    layer()?.querySelector('[data-scope="viewport"][data-direction="left"]')?.textContent
  ).toMatch(/120 px/u);
  runtime.setEnabled(true);
  runtime.setEnabled(false);
  expect(layer()).not.toBeNull();
  runtime.setExpanded(false);
  expect(layer()).toBeNull();
  runtime.setExpanded(true);
  target.element.remove();
  callbacks.pop()?.(0);
  expect(layer()).toBeNull();
  runtime.dispose();
});
