// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import { measureContentDrawingText, measureDrawingTextFittedWidth } from './text-measurement';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function setupMeasurement(rewrap = false) {
  const parent = document.createElement('div');
  parent.style.transform = 'rotate(45deg)';
  const element = document.createElement('span');
  element.textContent = 'Short\nText';
  element.style.width = '100%';
  parent.append(element);
  document.body.append(parent);
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({ width: '320px' } as CSSStyleDeclaration);
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 30, 320, 64));
  const range = document.createRange();
  Object.defineProperty(range, 'getClientRects', {
    configurable: true,
    value: () => {
      expect(parent.style.transform).toBe('none');
      return rewrap && element.style.width !== '100%'
        ? [new DOMRect(26, 32, 30, 20), new DOMRect(26, 52, 20, 20), new DOMRect(26, 72, 20, 20)]
        : [new DOMRect(26, 32, 50.25, 20), new DOMRect(26, 52, 30, 20)];
    },
  });
  vi.spyOn(document, 'createRange').mockReturnValue(range);
  return { element, parent };
}

it('fits the longest rendered line with existing padding and outward rounding', () => {
  const { element, parent } = setupMeasurement();
  expect(measureDrawingTextFittedWidth(element, 'Short\nText')).toBe(63);
  expect(element.textContent).toBe('Short\nText');
  expect(element.style.width).toBe('100%');
  expect(parent.style.transform).toBe('rotate(45deg)');
});

it('retains the original width if fitting changes line wrapping', () => {
  const { element } = setupMeasurement(true);
  expect(measureDrawingTextFittedWidth(element, 'Short\nText')).toBe(320);
  expect(element.style.width).toBe('100%');
});

it('restores local styles and preserves the draft when browser measurement fails', () => {
  const { element, parent } = setupMeasurement();
  vi.spyOn(document, 'createRange').mockImplementation(() => {
    throw new Error('Unavailable');
  });
  expect(measureDrawingTextFittedWidth(element, 'Short\nText')).toBeUndefined();
  expect(element.style.width).toBe('100%');
  expect(parent.style.transform).toBe('rotate(45deg)');
});

it('keeps deterministic measurement when the content runtime canvas is unavailable', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

  expect(
    measureContentDrawingText({ fontFamily: 'handwritten', fontSize: 24, line: 'Text' })
  ).toBeCloseTo(52.8);
});

it('measures the exact committed value and restores the live draft text node', () => {
  const { element } = setupMeasurement();
  element.textContent = '          Hi          ';
  const text = element.firstChild;
  const original = document.createRange();
  Object.defineProperty(original, 'getClientRects', {
    value: () => {
      expect(element.textContent).toBe('Hi');
      return [new DOMRect(26, 32, 20, 20)];
    },
  });
  vi.mocked(document.createRange).mockReturnValue(original);
  expect(measureDrawingTextFittedWidth(element, 'Hi')).toBe(32);
  expect(element.firstChild).toBe(text);
  expect(element.textContent).toBe('          Hi          ');
});
