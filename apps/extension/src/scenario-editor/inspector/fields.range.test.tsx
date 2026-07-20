// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InspectorRangeField } from './fields';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('maps displayed scenario percent ranges back to bounded domain values', () => {
  const onRangeCommit = vi.fn();

  act(() => {
    root?.render(
      <InspectorRangeField
        displayScale={100}
        label="Opacity"
        min={0}
        max={1}
        step={0.01}
        unit="%"
        value={1}
        onCommit={onRangeCommit}
      />
    );
  });

  const range = container?.querySelector<HTMLInputElement>('input[aria-label="Opacity range"]');
  const input = container?.querySelector<HTMLInputElement>('input[aria-label="Opacity"]');

  act(() => {
    setRangeValue(range!, '55');
    setInputValue(input!, '125');
  });

  expect(onRangeCommit).toHaveBeenCalledWith(0.55);
  expect(onRangeCommit).toHaveBeenCalledWith(1);
});

function setInputValue(field: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(field, value);
  field.dispatchEvent(new InputEvent('input', { bubbles: true }));
  field.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
}

function setRangeValue(field: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}
