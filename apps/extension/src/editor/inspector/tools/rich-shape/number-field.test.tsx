// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NumberField } from './number-field';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: vi.fn(),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderNumberField(onChange: (value: number) => void) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(<NumberField label="Size" value={16} min={10} max={20} onChange={onChange} />);
  });
}

function input() {
  const element = document.querySelector<HTMLInputElement>('[aria-label="Size"]');
  if (!element) {
    throw new Error('Missing size input');
  }
  return element;
}

function change(value: string) {
  const element = input();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  vi.unstubAllGlobals();
});

it('covers number field clamping and keyboard commit behavior', () => {
  const onChange = vi.fn();
  renderNumberField(onChange);

  act(() => change('30'));
  input().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  input().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));

  expect(onChange).toHaveBeenCalledWith(20);
});

it('covers number field invalid draft recovery and stepper keyboard controls', () => {
  const onChange = vi.fn();
  renderNumberField(onChange);

  act(() => change('bad'));
  act(() => input().dispatchEvent(new FocusEvent('blur', { bubbles: true })));
  const increase = document.querySelector<HTMLButtonElement>(
    '[aria-label="Size editor.compact.increaseAriaSuffix"]'
  );
  const decrease = document.querySelector<HTMLButtonElement>(
    '[aria-label="Size editor.compact.decreaseAriaSuffix"]'
  );
  if (!increase || !decrease) {
    throw new Error('Missing number field stepper buttons');
  }
  act(() => increase.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })));
  act(() => decrease.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' })));

  expect(onChange).toHaveBeenNthCalledWith(1, 17);
  expect(onChange).toHaveBeenNthCalledWith(2, 16);
  expect(input().value).toBe('16');
});
