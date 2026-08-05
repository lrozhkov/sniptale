// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PresetNameWithOverflowHint, TextWithOverflowHint } from './overflow-hint';

let container: HTMLDivElement | null = null;
let observerCallback: ResizeObserverCallback | null = null;
let root: Root | null = null;

class ResizeObserverStub implements ResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    observerCallback = callback;
  }

  disconnect() {}
  observe() {}
  unobserve() {}
}

function setMetric(element: HTMLElement, property: 'clientWidth' | 'scrollWidth', value: number) {
  Object.defineProperty(element, property, { configurable: true, value });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  observerCallback = null;
  vi.unstubAllGlobals();
});

describe('overflow hints', () => {
  it('exposes the full name as a native hint only while the rendered label is clipped', () => {
    act(() => root?.render(<PresetNameWithOverflowHint name="A very long frame style name" />));
    const name = container?.querySelector<HTMLElement>('.sniptale-glass-preset-name');
    if (!name || !observerCallback) throw new Error('Expected observed preset name');

    setMetric(name, 'clientWidth', 80);
    setMetric(name, 'scrollWidth', 160);
    act(() => observerCallback?.([], {} as ResizeObserver));
    expect(name.title).toBe('A very long frame style name');

    setMetric(name, 'scrollWidth', 72);
    act(() => observerCallback?.([], {} as ResizeObserver));
    expect(name.hasAttribute('title')).toBe(false);
  });

  it('uses the same clipped-only hint behavior for inspector property labels', () => {
    act(() => root?.render(<TextWithOverflowHint className="property-label" text="Padding" />));
    const label = container?.querySelector<HTMLElement>('.property-label');
    if (!label || !observerCallback) throw new Error('Expected observed property label');

    setMetric(label, 'clientWidth', 120);
    setMetric(label, 'scrollWidth', 80);
    act(() => observerCallback?.([], {} as ResizeObserver));
    expect(label.hasAttribute('title')).toBe(false);

    setMetric(label, 'scrollWidth', 180);
    act(() => observerCallback?.([], {} as ResizeObserver));
    expect(label.title).toBe('Padding');
  });
});
