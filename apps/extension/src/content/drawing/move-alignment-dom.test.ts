// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { collectDrawingDomAlignmentBounds } from './move-alignment-dom';
vi.mock('../platform/dom-host', () => ({
  isContentOwnedElement: (element: Element) => element.id === 'overlay',
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it('ignores extension chrome and reads a bounded local set instead of scanning the page', () => {
  const overlay = document.createElement('div');
  overlay.id = 'overlay';
  const target = document.createElement('div');
  document.body.append(target);
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 200, 120));
  const hit = vi.fn(() => [overlay, target, document.body]);
  Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: hit });
  const result = collectDrawingDomAlignmentBounds(
    { x: 100, y: 100, width: 200, height: 120 },
    { kind: 'viewport', element: null }
  );
  expect(result).toEqual([{ x: 100, y: 100, width: 200, height: 120 }]);
  expect(hit).toHaveBeenCalledTimes(9);
});

it('projects document and internal-scroll geometry into the drawing scene', () => {
  const scroller = document.createElement('div');
  const target = document.createElement('div');
  scroller.append(target);
  document.body.append(scroller);
  scroller.scrollTop = 300;
  scroller.scrollLeft = 40;
  vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 30, 500, 400));
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 120, 100));
  Object.defineProperty(document, 'elementsFromPoint', {
    configurable: true,
    value: vi.fn(() => [target]),
  });
  expect(
    collectDrawingDomAlignmentBounds(
      { x: 120, y: 370, width: 120, height: 100 },
      { kind: 'element', element: scroller }
    )[0]
  ).toEqual({ x: 120, y: 370, width: 120, height: 100 });
  vi.stubGlobal('scrollY', 200);
  expect(
    collectDrawingDomAlignmentBounds(
      { x: 100, y: 300, width: 120, height: 100 },
      { kind: 'document', element: document.documentElement }
    )[0]?.y
  ).toBe(300);
});

it('ignores invisible/tiny and viewport-filling candidates and fails soft if the page hit-test fails', () => {
  const target = document.createElement('div');
  document.body.append(target);
  const hit = vi.fn(() => [target]);
  Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: hit });
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 2, 2));
  const read = () =>
    collectDrawingDomAlignmentBounds(
      { x: 100, y: 100, width: 80, height: 80 },
      { kind: 'viewport', element: null }
    );
  expect(read()).toEqual([]);
  vi.mocked(target.getBoundingClientRect).mockReturnValue(
    new DOMRect(0, 0, window.innerWidth, window.innerHeight)
  );
  expect(read()).toEqual([]);
  vi.mocked(target.getBoundingClientRect).mockReturnValue(new DOMRect(100, 100, 120, 100));
  target.style.opacity = '0';
  expect(read()).toEqual([]);
  hit.mockImplementation(() => {
    throw new Error('Unavailable hit-test');
  });
  expect(read()).toEqual([]);
});
