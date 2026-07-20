// @vitest-environment jsdom

import { act } from 'react';
import type React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { NumericRow, NumericValueField } from './numeric';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function setInputValue(field: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function createPointerEvent(type: string, init: PointerEventInit = {}) {
  const PointerEventCtor = globalThis.PointerEvent ?? MouseEvent;
  const event = new PointerEventCtor(type, init);
  Object.defineProperty(event, 'pointerId', { configurable: true, value: init.pointerId ?? 1 });
  return event;
}

function createNumericRowRect() {
  return {
    bottom: 40,
    height: 40,
    left: 0,
    right: 240,
    top: 0,
    width: 240,
    x: 0,
    y: 0,
    toJSON: () => undefined,
  } as DOMRect;
}

function createTestRoot() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  return { container, root };
}

function renderNumeric(props: Partial<React.ComponentProps<typeof NumericValueField>> = {}) {
  createTestRoot();
  const onCommitValue = props.onCommitValue ?? vi.fn();

  act(() => {
    root?.render(
      <NumericValueField
        label="Opacity"
        value={20}
        min={10}
        max={50}
        onPreviewValue={() => undefined}
        onCommitValue={onCommitValue}
        {...props}
      />
    );
  });

  return { onCommitValue };
}

function renderScrubbedNumericRow(onCommitValue: (value: number) => void) {
  createTestRoot();

  act(() => {
    root?.render(
      <NumericRow
        label="Opacity"
        value={42}
        min={0}
        max={100}
        scrub={{ min: 0, max: 100, step: 1 }}
        onPreviewValue={() => undefined}
        onCommitValue={onCommitValue}
      />
    );
  });
}

function input() {
  return container!.querySelector<HTMLInputElement>('input[aria-label="Opacity"]')!;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

it('reverts invalid drafts on blur and clamps valid commits to configured bounds', () => {
  const { onCommitValue } = renderNumeric();

  act(() => {
    input().dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    setInputValue(input(), 'bad');
    input().dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  expect(input().value).toBe('20');
  expect(onCommitValue).not.toHaveBeenCalled();

  act(() => {
    input().dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    setInputValue(input(), '80');
    input().dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  expect(input().value).toBe('50');
  expect(onCommitValue).toHaveBeenCalledWith(50);
});

it('ignores row range hover when scrub is absent or the row is disabled', () => {
  createTestRoot();

  act(() => {
    root?.render(
      <>
        <NumericRow
          label="No scrub"
          value={12}
          onPreviewValue={() => undefined}
          onCommitValue={() => undefined}
        />
        <NumericRow
          disabled
          label="Disabled scrub"
          value={12}
          scrub={{ min: 0, max: 20, step: 1 }}
          onPreviewValue={() => undefined}
          onCommitValue={() => undefined}
        />
      </>
    );
  });

  const rows = container!.querySelectorAll<HTMLElement>(
    '[data-ui="shared.ui.compact-inspector.numeric-row"]'
  );
  rows.forEach((row) => {
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
    act(() => {
      row.dispatchEvent(createPointerEvent('pointermove', { bubbles: true, clientY: 38 }));
    });
    expect(row.dataset['rangeVisible']).toBe('false');
  });
  expect(container!.querySelectorAll('input[type="range"]')).toHaveLength(0);
});

it('keeps scrubbed range controls aligned inside the numeric row bounds', () => {
  createTestRoot();

  act(() => {
    root?.render(
      <NumericRow
        label="Opacity"
        value={42}
        min={0}
        max={100}
        scrub={{ min: 0, max: 100, step: 1 }}
        onPreviewValue={() => undefined}
        onCommitValue={() => undefined}
      />
    );
  });

  const range = container!.querySelector<HTMLInputElement>('input[aria-label="Opacity range"]');
  const scrub = container!.querySelector<HTMLElement>(
    '[data-ui="shared.ui.compact-inspector.numeric-range-scrub"]'
  );
  const track = container!.querySelector<HTMLElement>(
    '[data-ui="shared.ui.compact-inspector.numeric-range-track"]'
  );
  expect(range).not.toBeNull();
  expect(scrub?.style.bottom).toBe('-1px');
  expect(track?.style.top).toBe('calc(var(--sniptale-range-track-height) / -2)');
  expect(range?.style.top).toBe('calc(var(--sniptale-range-thumb-size) / -2)');
  expect(range?.style.width).toBe('auto');
  expect(range?.className).not.toContain('translate-y-1/2');
  expect(range?.style.getPropertyValue('--sniptale-range-shell-height')).toBe(
    'var(--sniptale-range-thumb-size)'
  );
  expect(range?.style.getPropertyValue('--sniptale-range-track-offset-y')).toBe('');
});

it('keeps the numeric value field width stable while editing', () => {
  renderNumeric();
  const field = container?.querySelector<HTMLElement>(
    '[data-ui="shared.ui.compact-inspector.numeric-value-field"]'
  );

  expect(field?.className).toContain('w-[6.25rem]');
  expect(field?.className).not.toContain('focus-within:w-');
});

it('keeps row scrubbers hidden until the lower edge is hot or active', () => {
  const onCommitValue = vi.fn();
  renderScrubbedNumericRow(onCommitValue);
  const activeContainer = container!;

  const row = activeContainer.querySelector<HTMLElement>(
    '[data-ui="shared.ui.compact-inspector.numeric-row"]'
  )!;
  const scrub = activeContainer.querySelector<HTMLElement>(
    '[data-ui="shared.ui.compact-inspector.numeric-range-scrub"]'
  )!;
  const range = activeContainer.querySelector<HTMLInputElement>(
    'input[aria-label="Opacity range"]'
  )!;
  row.getBoundingClientRect = createNumericRowRect;

  expect(scrub.className).toContain('opacity-0');
  act(() => {
    row.dispatchEvent(createPointerEvent('pointermove', { bubbles: true, clientY: 38 }));
  });
  expect(scrub.className).toContain('opacity-100');

  act(() => {
    range.dispatchEvent(createPointerEvent('pointerdown', { bubbles: true }));
    range.dispatchEvent(createPointerEvent('pointerup', { bubbles: true }));
  });
  expect(onCommitValue).toHaveBeenCalledWith(42);
});

it('syncs non-editing prop updates into the visible numeric draft', () => {
  createTestRoot();

  act(() => {
    root?.render(
      <NumericValueField
        label="Opacity"
        value={12}
        precision={0}
        unit="%"
        onPreviewValue={() => undefined}
        onCommitValue={() => undefined}
      />
    );
  });
  expect(input().value).toBe('12');

  act(() => {
    root?.render(
      <NumericValueField
        label="Opacity"
        value={24}
        precision={0}
        unit="%"
        onPreviewValue={() => undefined}
        onCommitValue={() => undefined}
      />
    );
  });
  expect(input().value).toBe('24');
});

it('covers compact numeric keyboard, stepper, and blur commit edges', () => {
  const onCommitValue = vi.fn();
  const { onCommitValue: commit } = renderNumeric({ onCommitValue, step: 2, value: 20 });
  const increase = container?.querySelector<HTMLButtonElement>(
    'button[aria-label="Opacity increase"]'
  );

  act(() => {
    increase?.dispatchEvent(createPointerEvent('pointerdown', { bubbles: true }));
    window.dispatchEvent(createPointerEvent('pointerup', { bubbles: true }));
  });
  expect(commit).toHaveBeenCalledWith(22);

  act(() => {
    input().dispatchEvent(new Event('pointerdown', { bubbles: true }));
    input().dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    setInputValue(input(), '27');
    input().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });
  expect(commit).toHaveBeenCalledWith(27);

  act(() => {
    input().dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    setInputValue(input(), '33');
    input().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    input().dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  expect(input().value).toBe('20');
});
