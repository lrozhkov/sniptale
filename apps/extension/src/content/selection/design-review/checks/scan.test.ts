// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { initializeContentUiRoots } from '../../../platform/dom-host';
import { scanDesignReviewChecks, REVIEW_CHECK_MAX_ELEMENTS } from './scan';
let rectangles: WeakMap<Element, DOMRect>, textRectangles: WeakMap<Node, DOMRect>;
let rangeDescriptor: PropertyDescriptor | undefined;
const pseudoPaint = new Set<Element>();
function element(tag = 'div', text = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}
function box(node: Element, x = 100, y = 100, width = 100, height = 30) {
  rectangles.set(node, DOMRect.fromRect({ x, y, width, height }));
  return node;
}
function root() {
  const node = element();
  node.style.cssText = 'background-color:white';
  document.body.append(node);
  return node;
}
function kinds(result: ReturnType<typeof scanDesignReviewChecks>) {
  return result?.findings.map((item) => item.kind) ?? [];
}
beforeEach(() => {
  rectangles = new WeakMap();
  textRectangles = new WeakMap();
  pseudoPaint.clear();
  const native = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((node, pseudo) => {
    if (!pseudo) {
      const value = native(node);
      if (node instanceof HTMLElement && node.style.textShadow === 'none')
        Object.defineProperty(value, 'textShadow', { value: 'none' });
      return value;
    }
    const style = document.createElement('span').style;
    style.content = pseudoPaint.has(node) ? '"paint"' : 'none';
    return style;
  });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return rectangles.get(this) ?? DOMRect.fromRect({ x: 100, y: 100, width: 100, height: 30 });
  });
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
    const rect = this.getBoundingClientRect();
    return {
      0: rect,
      length: 1,
      item: (index: number) => (index === 0 ? rect : null),
      [Symbol.iterator]: () => [rect].values(),
    };
  });
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(100);
  vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(100);
  Object.defineProperty(document.documentElement, 'clientWidth', {
    configurable: true,
    value: 1280,
  });
  rangeDescriptor = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect');
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: function (this: Range) {
      return (
        textRectangles.get(this.startContainer) ??
        DOMRect.fromRect({ x: 110, y: 100, width: 40, height: 20 })
      );
    },
  });
});
afterEach(() => {
  document.body.replaceChildren();
  document.body.style.cssText = '';
  Reflect.deleteProperty(document.documentElement, 'clientWidth');
  if (rangeDescriptor)
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', rangeDescriptor);
  else Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
  vi.restoreAllMocks();
});
it('reports concrete markup hints and preserves deliberate alternatives without editing the source', () => {
  const scope = root(),
    image = element('img'),
    decorative = element('img'),
    namedImage = element('img'),
    button = element('button'),
    named = element('button', 'Save'),
    field = element('input');
  decorative.setAttribute('alt', '');
  namedImage.setAttribute('aria-label', 'Diagram');
  field.setAttribute('type', 'password');
  Object.defineProperty(field, 'value', {
    get: () => {
      throw new Error('Sensitive value read');
    },
  });
  scope.append(image, decorative, namedImage, button, named, field);
  const before = scope.outerHTML;
  const result = scanDesignReviewChecks(scope, 'selected');
  expect(
    result?.findings.filter((item) => item.kind === 'missing-alt').map((item) => item.target)
  ).toEqual([image]);
  expect(
    result?.findings.filter((item) => item.kind === 'missing-name').map((item) => item.target)
  ).toEqual([button]);
  expect(kinds(result)).toContain('missing-label');
  expect(scope.outerHTML).toBe(before);
});
it('stops traversal at the explicit element budget and declares truncation', () => {
  const scope = root(),
    fragment = document.createDocumentFragment();
  for (let index = 0; index < 1100; index++) fragment.append(element());
  scope.append(fragment);
  const result = scanDesignReviewChecks(scope, 'selected');
  expect(result?.visited).toBe(REVIEW_CHECK_MAX_ELEMENTS);
  expect(result?.truncated).toBe(true);
});
it('excludes hidden/inert and owned UI, and records iframe or shadow boundaries', () => {
  const scope = root(),
    hidden = element('section'),
    inert = element('section'),
    frame = element('iframe'),
    host = element();
  hidden.hidden = true;
  inert.setAttribute('inert', '');
  hidden.append(element('img'));
  inert.append(element('button'));
  host.attachShadow({ mode: 'open' }).append(element('button'));
  scope.append(hidden, inert, frame, host);
  const uiHost = element();
  document.body.append(uiHost);
  const ui = uiHost.attachShadow({ mode: 'open' });
  initializeContentUiRoots(ui);
  ui.append(element('button'));
  const result = scanDesignReviewChecks(scope, 'selected');
  expect(kinds(result)).not.toContain('missing-alt');
  expect(kinds(result)).not.toContain('missing-name');
  expect(result?.skipped.hidden).toBe(2);
  expect(result?.skipped.boundaries).toBe(2);
  expect(scanDesignReviewChecks(ui.firstElementChild!, 'selected')).toBeNull();
});
it('distinguishes measured solid contrast from unknown paint instead of assuming a canvas', () => {
  const scope = root(),
    low = element('p', 'Read this'),
    gradient = element('p', 'Gradient text'),
    large = element('p', 'Large type');
  low.style.cssText = 'color:rgb(119,119,119);font-size:16px;text-shadow:none';
  gradient.style.cssText =
    'color:rgb(119,119,119);font-size:16px;text-shadow:none;background-image:linear-gradient(white,black)';
  large.style.cssText = 'color:rgb(136,136,136);font-size:24px;text-shadow:none';
  scope.append(low, gradient, large);
  const result = scanDesignReviewChecks(scope, 'selected');
  expect(
    result?.findings.filter((item) => item.kind === 'contrast').map((item) => item.target)
  ).toEqual([low]);
  expect(result?.skipped.unknownContrast).toBeGreaterThan(0);
});
it('does not report text clipping caused only by an oversized child or intentional ellipsis', () => {
  const scope = root(),
    container = element('div', 'Short'),
    child = element('span', 'A long child'),
    truncated = element('div', 'This is intentionally shortened');
  container.append(child);
  container.style.cssText = 'overflow-x:hidden;white-space:nowrap';
  truncated.style.cssText = 'overflow-x:hidden;white-space:nowrap;text-overflow:ellipsis';
  scope.append(container, truncated);
  Object.defineProperty(container, 'scrollWidth', { configurable: true, value: 600 });
  Object.defineProperty(truncated, 'scrollWidth', { configurable: true, value: 600 });
  expect(kinds(scanDesignReviewChecks(scope, 'selected'))).not.toContain('text-clipping');
});
it('reports clipped own text and small control bounds rather than the size of an icon', () => {
  const scope = root(),
    clipped = element('div', 'A line that exceeds its clipping box'),
    small = element('button', 'Go'),
    normal = element('button', 'Save'),
    icon = element('span');
  clipped.style.cssText = 'overflow-x:hidden;white-space:nowrap';
  scope.append(clipped, small, normal);
  normal.append(icon);
  box(small, 100, 100, 16, 16);
  box(normal, 100, 100, 32, 32);
  box(icon, 100, 100, 12, 12);
  Object.defineProperty(clipped, 'scrollWidth', { configurable: true, value: 350 });
  textRectangles.set(
    clipped.firstChild!,
    DOMRect.fromRect({ x: 110, y: 100, width: 350, height: 20 })
  );
  const result = scanDesignReviewChecks(scope, 'selected');
  expect(
    result?.findings.filter((item) => item.kind === 'small-target').map((item) => item.target)
  ).toEqual([small]);
  expect(
    result?.findings.filter((item) => item.kind === 'text-clipping').map((item) => item.target)
  ).toEqual([clipped]);
});
it('preserves unknown names and avoids overflow verdicts for a scroll container', () => {
  const scope = root(),
    unknown = element('button'),
    scroll = element('div'),
    outside = element('div');
  unknown.setAttribute('aria-labelledby', 'missing-reference');
  scroll.style.overflowX = 'auto';
  scroll.append(outside);
  scope.append(unknown, scroll);
  box(outside, 1400, 100, 100, 30);
  const result = scanDesignReviewChecks(scope, 'selected');
  expect(result?.skipped.unknownNames).toBe(1);
  expect(kinds(result)).not.toContain('missing-name');
  expect(kinds(result)).not.toContain('horizontal-overflow');
});
it('does not replace a disconnected original root with a recreated element', () => {
  const original = root();
  original.id = 'same';
  original.remove();
  const replacement = root();
  replacement.id = 'same';
  expect(scanDesignReviewChecks(original, 'selected')).toBeNull();
  expect(scanDesignReviewChecks(replacement, 'selected')?.root).toBe(replacement);
});
