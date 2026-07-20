// @vitest-environment jsdom

import { act, useState } from 'react';
import type React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { NumericRow } from './numeric';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderNumericRow(props: Partial<React.ComponentProps<typeof NumericRow>> = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const onPreviewValue = props.onPreviewValue ?? vi.fn();
  const onCommitValue = props.onCommitValue ?? vi.fn();

  act(() => {
    root?.render(
      <NumericRow
        label="Opacity"
        value={40}
        unit="%"
        min={0}
        max={100}
        step={5}
        scrub={{ min: 0, max: 100, step: 1 }}
        onPreviewValue={onPreviewValue}
        onCommitValue={onCommitValue}
        {...props}
      />
    );
  });

  return { onCommitValue, onPreviewValue };
}

function renderStatefulNumericRow() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const onCommitValue = vi.fn();
  const onPreviewValue = vi.fn();

  function StatefulNumericRow() {
    const [value, setValue] = useState(40);
    return (
      <NumericRow
        label="Opacity"
        value={value}
        unit="%"
        min={0}
        max={100}
        step={5}
        scrub={{ min: 0, max: 100, step: 1 }}
        onPreviewValue={(nextValue) => {
          setValue(nextValue);
          onPreviewValue(nextValue);
        }}
        onCommitValue={onCommitValue}
      />
    );
  }

  act(() => {
    root?.render(<StatefulNumericRow />);
  });

  return { onCommitValue, onPreviewValue };
}

function assignInputValue(field: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(field, value);
}

function setRangeValue(field: HTMLInputElement, value: string) {
  assignInputValue(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function createPointerEvent(type: string, init: PointerEventInit = {}) {
  const PointerEventCtor = globalThis.PointerEvent ?? MouseEvent;
  const event = new PointerEventCtor(type, init);
  Object.defineProperty(event, 'pointerId', { configurable: true, value: init.pointerId ?? 1 });
  return event;
}

function setNumericRowRect(row: HTMLElement) {
  row.getBoundingClientRect = () =>
    ({
      bottom: 40,
      height: 40,
      left: 0,
      right: 240,
      top: 0,
      width: 240,
      x: 0,
      y: 0,
      toJSON: () => undefined,
    }) as DOMRect;
}

function getRow() {
  const row = container?.querySelector<HTMLElement>(
    '[data-ui="shared.ui.compact-inspector.numeric-row"]'
  );
  if (!row) {
    throw new Error('numeric row missing');
  }
  return row;
}

function getRange() {
  const range = container?.querySelector<HTMLInputElement>('input[aria-label="Opacity range"]');
  if (!range) {
    throw new Error('range input missing');
  }
  return range;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

it('previews and commits range changes on the numeric row lower edge', () => {
  const { onCommitValue, onPreviewValue } = renderNumericRow();
  const range = getRange();

  act(() => {
    setRangeValue(range, '72');
    assignInputValue(range, '72');
    range.dispatchEvent(createPointerEvent('pointerup', { bubbles: true }));
  });

  expect(onPreviewValue).toHaveBeenCalledWith(72);
  expect(onCommitValue).toHaveBeenCalledWith(72);
});

it('keeps range pointer interaction inside the numeric row', () => {
  const onParentPointerDown = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <div onPointerDown={onParentPointerDown}>
        <NumericRow
          label="Opacity"
          value={40}
          min={0}
          max={100}
          scrub={{ min: 0, max: 100, step: 1 }}
          onPreviewValue={vi.fn()}
          onCommitValue={vi.fn()}
        />
      </div>
    );
  });

  act(() => {
    getRange().dispatchEvent(createPointerEvent('pointerdown', { bubbles: true }));
  });

  expect(onParentPointerDown).not.toHaveBeenCalled();
});

it('omits range scrub controls when the numeric row is disabled', () => {
  renderNumericRow({ disabled: true });

  expect(container?.querySelector('input[aria-label="Opacity range"]')).toBeNull();
});

it('falls back to the scrub minimum for mixed range values', () => {
  renderNumericRow({ value: null });
  const range = getRange();

  expect(range.value).toBe('0');
});

it('commits keyboard range changes', () => {
  const { onCommitValue, onPreviewValue } = renderStatefulNumericRow();
  const range = getRange();

  act(() => {
    assignInputValue(range, '100');
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowRight' }));
  });

  expect(onPreviewValue).toHaveBeenCalledWith(100);
  expect(onCommitValue).toHaveBeenCalledWith(100);
});

it('keeps the range slider on the lower edge of the whole numeric row', () => {
  renderNumericRow();

  expect(getRow().className).toContain('group/compact-numeric-row');
  expect(
    container?.querySelector('[data-ui="shared.ui.compact-inspector.numeric-range-scrub"]')
  ).not.toBeNull();
  expect(
    container?.querySelector('[data-ui="shared.ui.compact-inspector.numeric-range-track"]')
  ).not.toBeNull();
  expect(getRange().className).toContain('absolute');
  expect(getRange().style.top).toBe('calc(var(--sniptale-range-thumb-size) / -2)');
  expect(getRange().style.width).toBe('auto');
  expect(getRange().className).not.toContain('translate-y-1/2');
  expect(getRange().style.left).toBe('calc(var(--sniptale-range-thumb-size) / -2)');
  expect(getRange().style.right).toBe('calc(var(--sniptale-range-thumb-size) / -2)');
  expect(getRange().style.getPropertyValue('--sniptale-range-shell-height')).toBe(
    'var(--sniptale-range-thumb-size)'
  );
  expect(getRange().style.getPropertyValue('--sniptale-range-track-offset-y')).toBe('');
  expect(getRange().className).not.toContain('group-focus-within/compact-numeric-row:opacity-100');
});

it('reveals the row range only near the lower edge or during active pointer drag', () => {
  renderNumericRow();

  const row = getRow();
  const range = getRange();
  const scrub = container?.querySelector<HTMLElement>(
    '[data-ui="shared.ui.compact-inspector.numeric-range-scrub"]'
  );
  const valueInput = container?.querySelector<HTMLInputElement>('input[aria-label="Opacity"]');
  setNumericRowRect(row);

  act(() => {
    valueInput?.focus();
  });
  expect(row.dataset['rangeVisible']).toBe('false');
  expect(scrub?.className).toContain('opacity-0');
  expect(range.className).toContain('pointer-events-none');

  act(() => {
    valueInput?.blur();
  });
  expect(row.dataset['rangeVisible']).toBe('false');
  expect(scrub?.className).toContain('opacity-0');
  expect(range.className).toContain('pointer-events-none');

  act(() => {
    row.dispatchEvent(createPointerEvent('pointermove', { bubbles: true, clientY: 34 }));
  });
  expect(row.dataset['rangeVisible']).toBe('true');
  expect(scrub?.className).toContain('opacity-100');
  expect(range.className).toContain('pointer-events-auto');

  act(() => {
    range.dispatchEvent(createPointerEvent('pointerdown', { bubbles: true }));
    row.dispatchEvent(createPointerEvent('pointermove', { bubbles: true, clientY: 12 }));
  });
  expect(row.dataset['rangeVisible']).toBe('true');

  act(() => {
    range.dispatchEvent(createPointerEvent('pointerup', { bubbles: true }));
  });
  expect(row.dataset['rangeVisible']).toBe('false');
});
