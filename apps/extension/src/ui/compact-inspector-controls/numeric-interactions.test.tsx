// @vitest-environment jsdom

import { act } from 'react';
import type React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { NumericRow, NumericValueField } from './numeric';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderNumeric(props: Partial<React.ComponentProps<typeof NumericValueField>> = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const onPreviewValue = props.onPreviewValue ?? vi.fn();
  const onCommitValue = props.onCommitValue ?? vi.fn();

  act(() => {
    root?.render(
      <NumericValueField
        label="Opacity"
        value={40}
        unit="%"
        min={0}
        max={100}
        step={5}
        onPreviewValue={onPreviewValue}
        onCommitValue={onCommitValue}
        {...props}
      />
    );
  });

  return { onCommitValue, onPreviewValue };
}

function input() {
  const field = container?.querySelector<HTMLInputElement>('input[aria-label="Opacity"]');
  if (!field) {
    throw new Error('numeric input missing');
  }
  return field;
}

function setInputValue(field: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function createPointerEvent(type: string, init: PointerEventInit & { pointerType?: string } = {}) {
  const PointerEventCtor = globalThis.PointerEvent ?? MouseEvent;
  const event = new PointerEventCtor(type, init);
  Object.defineProperty(event, 'pointerId', { configurable: true, value: init.pointerId ?? 1 });
  Object.defineProperty(event, 'pointerType', {
    configurable: true,
    value: init.pointerType ?? 'mouse',
  });
  return event;
}

afterEach(() => {
  vi.useRealTimers();
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

it('repeats stepper changes while a direction button is held', () => {
  vi.useFakeTimers();
  const { onCommitValue, onPreviewValue } = renderNumeric({ step: 5, value: 10 });
  const increase = container?.querySelector<HTMLButtonElement>(
    'button[aria-label="Opacity increase"]'
  );

  act(() => {
    increase?.dispatchEvent(
      createPointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'mouse' })
    );
    vi.advanceTimersByTime(220);
    vi.advanceTimersByTime(70);
    vi.advanceTimersByTime(70);
    window.dispatchEvent(
      createPointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'mouse' })
    );
  });

  expect(onPreviewValue).toHaveBeenNthCalledWith(1, 15);
  expect(onPreviewValue).toHaveBeenNthCalledWith(2, 20);
  expect(onPreviewValue).toHaveBeenNthCalledWith(3, 25);
  expect(onCommitValue).toHaveBeenNthCalledWith(1, 15);
  expect(onCommitValue).toHaveBeenNthCalledWith(2, 20);
  expect(onCommitValue).toHaveBeenNthCalledWith(3, 25);
});

it('keeps units display-only while editing and restores invalid drafts', () => {
  const { onCommitValue, onPreviewValue } = renderNumeric({ value: 90 });

  act(() => {
    input().dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    setInputValue(input(), '75%');
  });

  expect(container?.textContent).not.toContain('%');
  expect(input().value).toBe('75');
  expect(onPreviewValue).not.toHaveBeenCalled();

  act(() => {
    setInputValue(input(), 'bad');
    input().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  });

  expect(input().value).toBe('90');
  expect(onCommitValue).not.toHaveBeenCalled();
});

it('keeps the unit hidden when the stepper changes an active edit field', () => {
  const { onCommitValue } = renderNumeric({ step: 1, unit: 'px', value: 18 });
  const increase = container?.querySelector<HTMLButtonElement>(
    'button[aria-label="Opacity increase"]'
  );

  act(() => {
    input().focus();
    increase?.dispatchEvent(createPointerEvent('pointerdown', { bubbles: true }));
    window.dispatchEvent(createPointerEvent('pointerup', { bubbles: true }));
  });

  expect(input().value).toBe('19');
  expect(container?.textContent).not.toContain('px');
  expect(onCommitValue).toHaveBeenCalledWith(19);
});

it('commits Enter and focuses the next numeric text input in the compact form', () => {
  const onCommitValue = vi.fn();
  const onPreviewValue = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <div>
        <NumericRow
          label="Width"
          value={20}
          unit="px"
          onPreviewValue={onPreviewValue}
          onCommitValue={onCommitValue}
        />
        <NumericRow
          label="Opacity"
          value={40}
          unit="%"
          onPreviewValue={() => undefined}
          onCommitValue={() => undefined}
        />
      </div>
    );
  });
  const inputs = container.querySelectorAll<HTMLInputElement>(
    '[data-ui="shared.ui.compact-inspector.numeric-value-field"] input'
  );

  act(() => {
    inputs[0]?.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    setInputValue(inputs[0]!, '28');
    inputs[0]?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });

  expect(onCommitValue).toHaveBeenCalledWith(28);
  expect(document.activeElement).toBe(inputs[1]);
});

it('skips hidden and disabled form inputs when Enter advances focus', () => {
  const onCommitValue = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <form>
        <NumericRow
          label="Width"
          value={20}
          unit="px"
          onPreviewValue={() => undefined}
          onCommitValue={onCommitValue}
        />
        <input aria-label="Hidden field" hidden />
        <input aria-label="Disabled field" disabled />
        <input aria-label="Next field" />
      </form>
    );
  });

  const widthInput = container.querySelector<HTMLInputElement>('input[aria-label="Width"]');
  const nextInput = container.querySelector<HTMLInputElement>('input[aria-label="Next field"]');

  act(() => {
    widthInput?.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    setInputValue(widthInput!, '32');
    widthInput?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });

  expect(onCommitValue).toHaveBeenCalledWith(32);
  expect(document.activeElement).toBe(nextInput);
});

it('blurs the last compact numeric input after Enter commit', () => {
  const onCommitValue = vi.fn();
  renderNumeric({ onCommitValue, value: 12 });
  const field = container?.querySelector<HTMLInputElement>('input[aria-label="Opacity"]');

  act(() => {
    field?.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    setInputValue(field!, '18');
    field?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });

  expect(onCommitValue).toHaveBeenCalledWith(18);
  expect(document.activeElement).not.toBe(field);
});

it('keeps mixed and disabled values inert', () => {
  const { onCommitValue, onPreviewValue } = renderNumeric({
    disabled: true,
    scrub: { min: 0, max: 100, step: 1 },
    value: null,
  });
  const increase = container?.querySelector<HTMLButtonElement>(
    'button[aria-label="Opacity increase"]'
  );
  const range = container?.querySelector<HTMLInputElement>('input[aria-label="Opacity range"]');

  act(() => {
    increase?.dispatchEvent(
      createPointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'mouse' })
    );
  });

  expect(input().disabled).toBe(true);
  expect(input().placeholder).toBe('—');
  expect(range).toBeNull();
  expect(onPreviewValue).not.toHaveBeenCalled();
  expect(onCommitValue).not.toHaveBeenCalled();
});
