// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { isRecordingTextCursorTarget } from './text-cursor-target';

function paragraph() {
  const element = document.createElement('p');
  element.textContent = 'First line second line';
  document.body.append(element);
  return element;
}
function caretHit(element: HTMLElement, rects = [new DOMRect(10, 10, 70, 20)]) {
  const text = element.firstChild;
  if (!(text instanceof Text)) throw new Error('Fixture text required');
  const hit = vi.fn(() => ({ offsetNode: text, offset: 5 }));
  Object.defineProperty(document, 'caretPositionFromPoint', { configurable: true, value: hit });
  const range = document.createRange();
  Object.defineProperty(range, 'getClientRects', { value: () => rects });
  vi.spyOn(document, 'createRange').mockReturnValue(range);
  return hit;
}
function resolve(element: HTMLElement, x: number, y: number, cursor = 'auto', selecting = false) {
  return isRecordingTextCursorTarget(element, { clientX: x, clientY: y }, cursor, selecting);
}
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'caretPositionFromPoint');
});

it('uses glyph line rectangles, not the padding or union of wrapped lines', () => {
  const element = paragraph();
  caretHit(element, [new DOMRect(90, 10, 10, 20), new DOMRect(10, 40, 15, 20)]);
  expect(resolve(element, 95, 20)).toBe(true);
  expect(resolve(element, 15, 50)).toBe(true);
  expect(resolve(element, 60, 35)).toBe(false);
  expect(resolve(element, 140, 20)).toBe(false);
});

it.each(['a', 'button', 'summary', 'select', 'img'])(
  'keeps native auto on %s even when a nearby text caret is returned',
  (tag) => {
    const element = document.createElement(tag);
    if (element instanceof HTMLAnchorElement) element.href = '#';
    element.textContent = 'Control text';
    document.body.append(element);
    caretHit(element);
    expect(resolve(element, 40, 20)).toBe(false);
  }
);

it('keeps non-selectable and explicit custom cursors and ignores a neighbouring caret', () => {
  const element = paragraph();
  caretHit(element);
  element.style.userSelect = 'none';
  expect(resolve(element, 40, 20)).toBe(false);
  element.style.userSelect = 'text';
  expect(resolve(element, 40, 20, 'pointer')).toBe(false);
  expect(resolve(element, 40, 20, 'url("page.cur"), auto')).toBe(false);
  expect(resolve(paragraph(), 40, 20)).toBe(false);
});

it('keeps an active text selection through gaps but honours explicit pointer cursors', () => {
  const element = paragraph();
  caretHit(element);
  expect(resolve(element, 140, 20, 'auto', true)).toBe(true);
  expect(resolve(element, 140, 20, 'pointer', true)).toBe(false);
});

it('covers focused ordinary text and editing controls', () => {
  const element = paragraph();
  element.tabIndex = 0;
  element.focus();
  caretHit(element);
  expect(resolve(element, 40, 20)).toBe(true);
  const input = document.createElement('input');
  document.body.append(input);
  input.focus();
  expect(resolve(input, 40, 20, 'text')).toBe(true);
});

it('passes open shadow roots to native caret hit testing', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const element = paragraph();
  shadow.append(element);
  const hit = caretHit(element);
  expect(resolve(element, 40, 20)).toBe(true);
  expect(hit).toHaveBeenCalledWith(40, 20, { shadowRoots: [shadow] });
});

it('falls back to the native cursor when no text position can be obtained', () => {
  expect(resolve(paragraph(), 40, 20)).toBe(false);
});
