// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PopupHints, resolvePopupHint } from './index';

let root: Root | null = null;
const resizeCallbacks = new Set<() => void>();

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resizeCallbacks.add(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  resizeCallbacks.clear();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function mountHints() {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<PopupHints />));
}

function hover(element: Element) {
  act(() => element.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })));
}

function tooltip() {
  return document.querySelector('[role="tooltip"]');
}

function button(label: string, hint = label) {
  const element = document.createElement('button');
  element.textContent = label;
  element.dataset['popupHint'] = hint;
  element.style.overflowX = 'hidden';
  element.style.overflowY = 'hidden';
  document.body.append(element);
  return element;
}

it('does not repeat a fully visible label', () => {
  const element = button('Download');
  expect(resolvePopupHint(element)).toBeNull();
  expect(element.textContent).toBe('Download');
  expect(element.hasAttribute('title')).toBe(false);
});

it('exposes the full label only while it is clipped', () => {
  const element = button('A long microphone name');
  Object.defineProperties(element, {
    scrollWidth: { value: 240, configurable: true },
    clientWidth: { value: 100, configurable: true },
  });
  expect(resolvePopupHint(element)).toBe('A long microphone name');
  Object.defineProperty(element, 'clientWidth', { value: 240 });
  expect(resolvePopupHint(element)).toBeNull();
});

it('detects clipped descendants and multiline clamping', () => {
  const element = button('');
  element.dataset['popupHint'] = 'A long project name';
  const label = document.createElement('span');
  label.textContent = 'A long project name';
  label.style.overflowY = 'hidden';
  Object.defineProperties(label, { scrollHeight: { value: 48 }, clientHeight: { value: 32 } });
  element.append(label);
  expect(resolvePopupHint(element)).toBe('A long project name');
});

it('keeps an explanation available without label clipping', () => {
  const element = button('Export', 'Includes images and page content');
  expect(resolvePopupHint(element)).toBe('Includes images and page content');
});

it('keeps a visual hint for an icon button with an accessible name', () => {
  const element = button('');
  element.setAttribute('aria-label', 'Settings');
  element.dataset['popupHint'] = 'Settings';
  const hidden = document.createElement('span');
  hidden.className = 'sr-only';
  hidden.textContent = 'Settings';
  element.append(hidden);
  expect(resolvePopupHint(element)).toBe('Settings');
  expect(element.getAttribute('aria-label')).toBe('Settings');
});

it('does not repeat a visible description or composed quick-action hint', () => {
  const element = button(
    'Visible area Current tab Ctrl+Shift+1',
    'Visible area • Current tab • Ctrl+Shift+1'
  );
  expect(resolvePopupHint(element)).toBeNull();
  element.dataset['popupHint'] = 'Current tab';
  expect(resolvePopupHint(element)).toBeNull();
});

it('uses browser titles for explanations without rendering a tooltip', () => {
  mountHints();
  const element = button('Export', 'Includes page images');
  element.setAttribute('aria-description', 'Existing description');
  act(() => element.focus());
  expect(element.title).toBe('Includes page images');
  expect(element.getAttribute('aria-description')).toBe('Existing description');
  expect(tooltip()).toBeNull();
  act(() => element.blur());
  expect(element.hasAttribute('title')).toBe(false);
});

it('uses browser titles for icon buttons and clears them after pointer exit', () => {
  mountHints();
  const element = button('', 'Settings');
  element.setAttribute('aria-label', 'Settings');
  hover(element);
  expect(element.title).toBe('Settings');
  expect(element.getAttribute('aria-label')).toBe('Settings');
  act(() =>
    element.dispatchEvent(
      new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body })
    )
  );
  expect(element.hasAttribute('title')).toBe(false);
});

it('preserves clipped text and accessible naming on focus without additional UI', () => {
  mountHints();
  const element = button('A long microphone name');
  Object.defineProperties(element, {
    scrollWidth: { value: 240, configurable: true },
    clientWidth: { value: 100, configurable: true },
  });
  act(() => element.focus());
  expect(element.title).toBe('A long microphone name');
  expect(tooltip()).toBeNull();
  expect(element.textContent).toBe('A long microphone name');
  act(() => element.blur());
  expect(element.hasAttribute('title')).toBe(false);
});

it('rechecks clipping and restores attributes after resize, removal and disposal', async () => {
  mountHints();
  const element = button('A long microphone name');
  Object.defineProperties(element, {
    scrollWidth: { value: 240, configurable: true },
    clientWidth: { value: 100, configurable: true },
  });
  hover(element);
  expect(element.title).toBe('A long microphone name');
  Object.defineProperty(element, 'clientWidth', { value: 240 });
  act(() => {
    for (const callback of resizeCallbacks) callback();
  });
  expect(element.hasAttribute('title')).toBe(false);
  element.dataset['popupHint'] = 'Additional information';
  hover(element);
  expect(element.title).toBe('Additional information');
  await act(async () => element.remove());
  expect(element.hasAttribute('title')).toBe(false);
  const icon = button('', 'Settings');
  hover(icon);
  act(() => root?.unmount());
  root = null;
  expect(icon.hasAttribute('title')).toBe(false);
});
