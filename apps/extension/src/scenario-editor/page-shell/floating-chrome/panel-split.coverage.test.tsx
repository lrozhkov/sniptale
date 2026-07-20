// @vitest-environment jsdom

import { act } from 'react';
import type { PointerEvent } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { FloatingPanelSplitHandle, useFloatingPanelSplit } from './panel-split';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function SplitHarness() {
  const currentSplit = useFloatingPanelSplit(0.7);
  const startWithoutParent = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.remove();
    currentSplit.startResize(event);
  };
  const updateWithoutParent = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.remove();
    currentSplit.updateResize(event);
  };

  return (
    <div data-ratio={currentSplit.ratio}>
      <FloatingPanelSplitHandle
        label="Resize panels"
        onKeyStep={currentSplit.stepResize}
        onPointerDown={currentSplit.startResize}
        onPointerMove={currentSplit.updateResize}
      />
      <button type="button" aria-label="Start without parent" onPointerDown={startWithoutParent} />
      <button
        type="button"
        aria-label="Update without parent"
        onPointerMove={updateWithoutParent}
      />
    </div>
  );
}

function ratio() {
  return container?.querySelector('div')?.getAttribute('data-ratio');
}

function pointerEvent(type: string, clientY: number) {
  return new MouseEvent(type, { bubbles: true, clientY });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
  act(() => root?.render(<SplitHarness />));
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('steps the split with arrow keys and ignores unrelated keys', () => {
  const handle = container?.querySelector<HTMLButtonElement>('button');

  act(() => {
    handle?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    handle?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
  });
  expect(ratio()).toBe('0.72');

  act(() => {
    handle?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowUp' }));
  });
  expect(ratio()).toBe('0.6699999999999999');
});

it('clamps pointer resizing and ignores moves without capture', () => {
  const handle = container?.querySelector<HTMLButtonElement>('button');
  const parent = handle?.parentElement;
  if (parent) {
    parent.getBoundingClientRect = () =>
      ({ height: 100, top: 100, toJSON: () => undefined }) as DOMRect;
  }

  act(() => {
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
    handle?.dispatchEvent(pointerEvent('pointermove', 150));
  });
  expect(ratio()).toBe('0.7');

  act(() => {
    handle?.dispatchEvent(pointerEvent('pointerdown', 0));
  });
  expect(ratio()).toBe('0.28');

  act(() => {
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
    handle?.dispatchEvent(pointerEvent('pointermove', 1000));
  });
  expect(ratio()).toBe('0.72');
});

it('returns safely when resize events have no parent container', () => {
  const startButton = container?.querySelector<HTMLButtonElement>(
    'button[aria-label="Start without parent"]'
  );
  const updateButton = container?.querySelector<HTMLButtonElement>(
    'button[aria-label="Update without parent"]'
  );

  expect(() => {
    act(() => startButton?.dispatchEvent(pointerEvent('pointerdown', 100)));
  }).not.toThrow();
  expect(() => {
    act(() => updateButton?.dispatchEvent(pointerEvent('pointermove', 100)));
  }).not.toThrow();
});
