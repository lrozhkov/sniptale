// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NativeHints, resolveNativeHint } from './index';

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
  act(() => root?.render(<NativeHints />));
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

it('does not restore a native title removed by its declarative owner while suppressed', async () => {
  mountHints();
  const element = button('Download');
  delete element.dataset['popupHint'];
  element.title = 'Download';
  hover(element);
  await act(async () => {
    element.removeAttribute('title');
    element.textContent = 'Export';
  });
  expect(element.hasAttribute('title')).toBe(false);
  act(() =>
    element.dispatchEvent(
      new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body })
    )
  );
  expect(element.hasAttribute('title')).toBe(false);
});

it('suppresses duplicate native titles through nested pointer transitions and restores them', async () => {
  mountHints();
  const element = button('Download');
  delete element.dataset['popupHint'];
  element.title = 'Download';
  const child = document.createElement('span');
  element.append(child);
  hover(element);
  expect(element.getAttribute('title')).toBe('');
  hover(child);
  expect(element.getAttribute('title')).toBe('');
  await act(async () => {
    element.title = 'Includes all files';
  });
  expect(element.title).toBe('Includes all files');
  act(() =>
    element.dispatchEvent(
      new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body })
    )
  );
  expect(element.title).toBe('Includes all files');
});

it('keeps native clipped labels on focus without changing content or adding UI', () => {
  mountHints();
  const element = button('A long name');
  delete element.dataset['popupHint'];
  element.title = 'A long name';
  Object.defineProperties(element, { scrollWidth: { value: 240 }, clientWidth: { value: 100 } });
  act(() => element.focus());
  expect(element.title).toBe('A long name');
  expect(element.textContent).toBe('A long name');
  expect(tooltip()).toBeNull();
  act(() => element.blur());
  expect(element.title).toBe('A long name');
});

it('does not repeat a fully visible label', () => {
  const element = button('Download');
  expect(resolveNativeHint(element)).toBeNull();
  expect(element.textContent).toBe('Download');
  expect(element.hasAttribute('title')).toBe(false);
});

it('exposes the full label only while it is clipped', () => {
  const element = button('A long microphone name');
  Object.defineProperties(element, {
    scrollWidth: { value: 240, configurable: true },
    clientWidth: { value: 100, configurable: true },
  });
  expect(resolveNativeHint(element)).toBe('A long microphone name');
  Object.defineProperty(element, 'clientWidth', { value: 240 });
  expect(resolveNativeHint(element)).toBeNull();
});

it('detects clipped descendants and multiline clamping', () => {
  const element = button('');
  element.dataset['popupHint'] = 'A long project name';
  const label = document.createElement('span');
  label.textContent = 'A long project name';
  label.style.overflowY = 'hidden';
  Object.defineProperties(label, { scrollHeight: { value: 48 }, clientHeight: { value: 32 } });
  element.append(label);
  expect(resolveNativeHint(element)).toBe('A long project name');
});

it('keeps an explanation available without label clipping', () => {
  const element = button('Export', 'Includes images and page content');
  expect(resolveNativeHint(element)).toBe('Includes images and page content');
});

it('keeps a visual hint for an icon button with an accessible name', () => {
  const element = button('');
  element.setAttribute('aria-label', 'Settings');
  element.dataset['popupHint'] = 'Settings';
  const hidden = document.createElement('span');
  hidden.className = 'sr-only';
  hidden.textContent = 'Settings';
  element.append(hidden);
  expect(resolveNativeHint(element)).toBe('Settings');
  expect(element.getAttribute('aria-label')).toBe('Settings');
});

it('does not repeat a visible description or composed quick-action hint', () => {
  const element = button(
    'Visible area Current tab Ctrl+Shift+1',
    'Visible area • Current tab • Ctrl+Shift+1'
  );
  expect(resolveNativeHint(element)).toBeNull();
  element.dataset['popupHint'] = 'Current tab';
  expect(resolveNativeHint(element)).toBeNull();
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
