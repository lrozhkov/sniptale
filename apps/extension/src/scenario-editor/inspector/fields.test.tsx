// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InspectorNumberField, InspectorRangeField } from './fields';
import { ScenarioFieldWrapperFixture, type ScenarioFieldCallbacks } from './fields.test-support';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

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

function setTextareaValue(field: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

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

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  vi.useRealTimers();
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('keeps the shared stepper repeating while scenario commits update the field value', () => {
  vi.useFakeTimers();
  const commits: number[] = [];

  function Harness() {
    const [value, setValue] = useState(400);
    return (
      <InspectorRangeField
        label="Weight"
        min={100}
        max={900}
        step={10}
        value={value}
        onCommit={(next) => {
          commits.push(next);
          setValue(next);
        }}
      />
    );
  }

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(<Harness />);
  });

  const increase = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Weight increase"]'
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

  expect(commits).toEqual([410, 420, 430]);
});

it('renders scenario field wrappers through compact shared controls', () => {
  const callbacks = createScenarioFieldCallbacks();

  renderScenarioFieldWrappers(callbacks);
  act(() => {
    setTextareaValue(
      container!.querySelector<HTMLTextAreaElement>('textarea[aria-label="Notes"]')!,
      'Updated'
    );
    container?.querySelector<HTMLButtonElement>('button[aria-pressed="false"]')?.click();
  });

  assertScenarioFieldWrapperSurface();
  assertScenarioFieldWrapperCallbacks(callbacks);
});

function createScenarioFieldCallbacks(): ScenarioFieldCallbacks {
  return {
    onBooleanChange: vi.fn(),
    onColorCommit: vi.fn(),
    onNumberCommit: vi.fn(),
    onRangeCommit: vi.fn(),
    onSelectChange: vi.fn(),
    onTextCommit: vi.fn(),
    onTitleCommit: vi.fn(),
  };
}

function renderScenarioFieldWrappers(callbacks: ScenarioFieldCallbacks) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(<ScenarioFieldWrapperFixture callbacks={callbacks} />);
  });
}

function assertScenarioFieldWrapperSurface() {
  const rendered = container;
  if (!rendered) {
    throw new Error('Scenario field wrapper container was not rendered');
  }
  expect(
    rendered.querySelector('[data-ui="shared.ui.compact-inspector.numeric-row"]')
  ).not.toBeNull();
  expect(rendered.querySelector<HTMLInputElement>('input[aria-label="Opacity"]')?.value).toBe('70');
  expect(
    rendered.querySelector('input[aria-label="Opacity"]')?.nextElementSibling?.textContent
  ).toBe('%');
  expect(
    rendered.querySelector('[data-ui="shared.ui.compact-inspector.color-field"]')
  ).not.toBeNull();
  expect(
    rendered.querySelector<HTMLLabelElement>('textarea[aria-label="Notes"]')?.closest('label')
      ?.className
  ).toContain('flex');
  expect(
    rendered.querySelector('[data-ui="shared.ui.compact-inspector.select-field"]')
  ).not.toBeNull();
}

function assertScenarioFieldWrapperCallbacks(callbacks: ScenarioFieldCallbacks) {
  expect(callbacks.onBooleanChange).toHaveBeenCalledWith(true);
  expect(callbacks.onColorCommit).not.toHaveBeenCalled();
  expect(callbacks.onNumberCommit).not.toHaveBeenCalled();
  expect(callbacks.onRangeCommit).not.toHaveBeenCalled();
  expect(callbacks.onSelectChange).not.toHaveBeenCalled();
  expect(callbacks.onTextCommit).toHaveBeenCalledWith('Updated');
  expect(callbacks.onTitleCommit).not.toHaveBeenCalled();
}

it('clamps scenario numeric field commits at the shared wrapper boundary', () => {
  const onNumberCommit = vi.fn();
  const onRangeCommit = vi.fn();

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <>
        <InspectorNumberField
          label="Width"
          min={0}
          max={100}
          value={40}
          onCommit={onNumberCommit}
        />
        <InspectorRangeField
          displayScale={100}
          label="Opacity"
          min={0}
          max={1}
          step={0.01}
          unit="%"
          value={0.5}
          onCommit={onRangeCommit}
        />
      </>
    );
  });

  act(() => {
    setInputValue(container!.querySelector<HTMLInputElement>('input[aria-label="Width"]')!, '999');
    setInputValue(container!.querySelector<HTMLInputElement>('input[aria-label="Opacity"]')!, '-2');
  });

  expect(onNumberCommit).toHaveBeenCalledWith(100);
  expect(onRangeCommit).toHaveBeenCalledWith(0);
});

it('updates bounded scenario numbers while the shared range is dragged', () => {
  const commits: number[] = [];

  function Harness() {
    const [value, setValue] = useState(4);
    return (
      <InspectorNumberField
        label="Stroke width"
        min={1}
        max={64}
        scrub
        value={value}
        onCommit={(next) => {
          commits.push(next);
          setValue(next);
        }}
      />
    );
  }

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(<Harness />);
  });

  const range = container.querySelector<HTMLInputElement>('input[aria-label="Stroke width range"]');
  const valueInput = container.querySelector<HTMLInputElement>('input[aria-label="Stroke width"]');

  act(() => {
    setRangeValue(range!, '12');
  });

  expect(commits).toEqual([12]);
  expect(valueInput?.value).toBe('12');
});
