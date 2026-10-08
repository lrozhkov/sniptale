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
