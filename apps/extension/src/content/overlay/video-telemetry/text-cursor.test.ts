// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import { createRecordingTextCursor } from './text-cursor';

let cursor: ReturnType<typeof createRecordingTextCursor>;
function hover(element: HTMLElement, type = 'pointerover'): void {
  element.dispatchEvent(new MouseEvent(type, { bubbles: true, composed: true }));
}
function target(value = 'text'): HTMLDivElement {
  const element = document.createElement('div');
  element.style.cursor = value;
  document.body.append(element);
  return element;
}
beforeEach(() => {
  vi.spyOn(runtimeInfo, 'getURL').mockImplementation((path) => `chrome-extension://test/${path}`);
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
  cursor = createRecordingTextCursor();
});
afterEach(() => {
  cursor.stop();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'caretRangeFromPoint');
  document.getSelection()?.removeAllRanges();
});

it.each(['default', 'pointer', 'ew-resize', 'none', 'url("site.cur"), text'])(
  'preserves a page cursor of %s',
  (value) => {
    const element = target(value);
    const original = element.style.cursor;
    cursor.start();
    hover(element);
    expect(element.style.cursor).toBe(original);
  }
);

it.each(['Linux x86_64', 'MacIntel'])('keeps %s native cursors', (platform) => {
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);
  const element = target();
  cursor.start();
  hover(element);
  expect(element.style.cursor).toBe('text');
});

it('restores the previous hover and preserves concurrent host style changes', () => {
  const first = target();
  const second = target();
  cursor.start();
  hover(first);
  expect(first.style.cursor).toContain('chrome-extension://test/cursors/text.svg');
  hover(second);
  expect(first.style.cursor).toBe('text');
  second.style.cursor = 'wait';
  cursor.stop();
  expect(second.style.cursor).toBe('wait');
  hover(first);
  expect(first.style.cursor).toBe('text');
});

it('removes only its own declaration and restores absent style attributes', () => {
  const style = document.createElement('style');
  style.textContent = '.text-target { cursor: text; }';
  document.body.append(style);
  const element = document.createElement('div');
  element.className = 'text-target';
  document.body.append(element);
  cursor.start();
  hover(element);
  expect(element.style.cursor).toContain('chrome-extension://test/cursors/text.svg');
  hover(element, 'pointerout');
  expect(element.hasAttribute('style')).toBe(false);
  hover(element);
  element.style.color = 'red';
  cursor.stop();
  expect(element.style.cursor).toBe('');
  expect(element.style.color).toBe('red');
});

it('resolves open shadow targets and releases them on pagehide and replacement', () => {
  const host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'open' });
  const element = target();
  shadow.append(element);
  document.body.append(host);
  cursor.start();
  hover(element);
  expect(element.style.cursor).toContain('chrome-extension://test/cursors/text.svg');
  cursor.start();
  expect(element.style.cursor).toBe('text');
  hover(element);
  window.dispatchEvent(new Event('pagehide'));
  expect(element.style.cursor).toBe('text');
  hover(element);
  expect(element.style.cursor).toBe('text');
});

it('leaves the native cursor intact when the extension context is unavailable', () => {
  vi.spyOn(runtimeInfo, 'getURL').mockImplementation(() => {
    throw new Error('Extension context invalidated');
  });
  const element = target();
  expect(() => cursor.start()).not.toThrow();
  hover(element);
  expect(element.style.cursor).toBe('text');
});

function mockTextHit(element: HTMLElement): void {
  const text = document.createTextNode('Ordinary selectable words');
  element.append(text);
  const caret = document.createRange();
  caret.setStart(text, 4);
  caret.collapse(true);
  Object.defineProperty(document, 'caretRangeFromPoint', {
    configurable: true,
    value: () => caret,
  });
  const character = document.createRange();
  Object.defineProperty(character, 'getClientRects', {
    value: () => [new DOMRect(10, 10, 70, 20)],
  });
  vi.spyOn(document, 'createRange').mockReturnValue(character);
}

function move(element: HTMLElement, x: number, buttons = 0): void {
  element.dispatchEvent(
    new MouseEvent('pointermove', {
      bubbles: true,
      composed: true,
      clientX: x,
      clientY: 20,
      buttons,
    })
  );
}

it('recognizes auto text and restores the arrow in padding of the same element', () => {
  const paragraph = target('auto');
  mockTextHit(paragraph);
  cursor.start();
  move(paragraph, 40);
  expect(paragraph.style.cursor).toContain('cursors/text.svg');
  move(paragraph, 140);
  expect(paragraph.style.cursor).toBe('auto');
  move(paragraph, 40);
  expect(paragraph.style.cursor).toContain('cursors/text.svg');
  cursor.stop();
  expect(paragraph.style.cursor).toBe('auto');
});

it('does not briefly restore on internal pointerout or rewrite a stable cursor', () => {
  const parent = target();
  const child = document.createElement('span');
  parent.append(child);
  cursor.start();
  hover(parent);
  const write = vi.spyOn(parent.style, 'setProperty');
  parent.dispatchEvent(new MouseEvent('pointerout', { bubbles: true, relatedTarget: child }));
  expect(parent.style.cursor).toContain('cursors/text.svg');
  move(parent, 10);
  move(parent, 20);
  expect(write).not.toHaveBeenCalled();
  hover(parent, 'pointerout');
  expect(parent.style.cursor).toBe('text');
});

it('keeps the I-beam while selecting through padding and releases it on pointerup', () => {
  const paragraph = target('auto');
  mockTextHit(paragraph);
  cursor.start();
  move(paragraph, 40);
  paragraph.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, buttons: 1 }));
  paragraph.dispatchEvent(new Event('selectstart', { bubbles: true }));
  document.getSelection()?.selectAllChildren(paragraph);
  move(paragraph, 140, 1);
  expect(paragraph.style.cursor).toContain('cursors/text.svg');
  paragraph.dispatchEvent(
    new MouseEvent('pointerup', { bubbles: true, clientX: 140, clientY: 20 })
  );
  expect(paragraph.style.cursor).toBe('auto');
});

it('clears text-selection cursor state when selection becomes a drag or is cancelled', () => {
  const paragraph = target('auto');
  mockTextHit(paragraph);
  cursor.start();
  paragraph.dispatchEvent(new Event('selectstart', { bubbles: true }));
  document.getSelection()?.selectAllChildren(paragraph);
  move(paragraph, 140, 1);
  expect(paragraph.style.cursor).toContain('cursors/text.svg');
  paragraph.dispatchEvent(new Event('dragstart', { bubbles: true }));
  move(paragraph, 140, 1);
  expect(paragraph.style.cursor).toBe('auto');
  paragraph.dispatchEvent(new Event('selectstart', { bubbles: true }));
  move(paragraph, 140, 1);
  expect(paragraph.style.cursor).toContain('cursors/text.svg');
  paragraph.dispatchEvent(new Event('pointercancel', { bubbles: true }));
  expect(paragraph.style.cursor).toBe('auto');
});
