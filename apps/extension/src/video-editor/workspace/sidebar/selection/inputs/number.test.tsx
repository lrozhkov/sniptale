// @vitest-environment jsdom

import { act, useState } from 'react';
import type React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { NumberInput } from './number';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderNumberInput(props: Partial<React.ComponentProps<typeof NumberInput>> = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  const onChange = props.onChange ?? vi.fn();
  root = createRoot(container);
  act(() => {
    root?.render(
      <NumberInput
        label="Width"
        value={640}
        min={40}
        max={7680}
        scrub
        onChange={onChange}
        {...props}
      />
    );
  });
  return { onChange };
}

function assignInputValue(field: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(field, value);
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

it('routes numeric editing through the shared compact inspector numeric row', () => {
  const markup = renderToStaticMarkup(<NumberInput label="X" value={42} onChange={vi.fn()} />);

  expect(markup).toContain('data-ui="shared.ui.compact-inspector.numeric-row"');
  expect(markup).toContain('data-ui="shared.ui.compact-inspector.numeric-value-field"');
  expect(markup).not.toContain('type="number"');
});

it('renders bounded values through the shared numeric scrub row with a single row label', () => {
  const markup = renderToStaticMarkup(
    <NumberInput label="Width" value={640} onChange={vi.fn()} min={40} max={7680} />
  );

  expect(markup).toContain('data-ui="shared.ui.compact-inspector.numeric-row"');
  expect(markup).toContain('aria-label="Width range"');
  expect(markup.match(/>Width<\/span>/g)?.length ?? 0).toBe(1);
});

it('previews bounded scrub changes while the shared range is dragged', () => {
  const { onChange } = renderNumberInput();
  const range = container?.querySelector<HTMLInputElement>('input[aria-label="Width range"]');
  if (!range) {
    throw new Error('range input missing');
  }

  act(() => {
    assignInputValue(range, '720');
    range.dispatchEvent(new Event('input', { bubbles: true }));
  });

  expect(onChange).toHaveBeenCalledWith(720);
});

it('does not duplicate bounded scrub commits when preview and commit share the same handler', () => {
  const onChange = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  function Harness() {
    const [value, setValue] = useState(640);
    return (
      <NumberInput
        label="Width"
        value={value}
        min={40}
        max={7680}
        scrub
        onChange={(nextValue) => {
          setValue(nextValue);
          onChange(nextValue);
        }}
      />
    );
  }

  act(() => {
    root?.render(<Harness />);
  });
  const range = container?.querySelector<HTMLInputElement>('input[aria-label="Width range"]');
  if (!range) {
    throw new Error('range input missing');
  }

  act(() => {
    assignInputValue(range, '720');
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new Event('pointerup', { bubbles: true }));
  });

  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith(720);
});

it('restores and closes a held numeric transaction on Undo before release', () => {
  const onCommit = vi.fn();
  const { onChange } = renderNumberInput({ onPreview: vi.fn(), onCommit });
  const field = container!.querySelector<HTMLInputElement>('input[aria-label="Width"]')!;
  const button = container!.querySelector<HTMLButtonElement>(
    'button[aria-label="Width increase"]'
  )!;
  act(() => {
    field.focus();
    button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  });
  expect(onChange).toHaveBeenLastCalledWith(641);
  expect(onCommit).not.toHaveBeenCalled();
  act(() =>
    field.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      })
    )
  );
  expect(onChange).toHaveBeenLastCalledWith(640);
  expect(onCommit).toHaveBeenCalledOnce();
  act(() => window.dispatchEvent(new MouseEvent('pointerup')));
  expect(onCommit).toHaveBeenCalledOnce();
  act(() => {
    button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    button.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  });
  expect(onCommit).toHaveBeenCalledTimes(2);
});

it('ends an unchanged native stepper activation and permits the next numeric edit', () => {
  const onCommit = vi.fn();
  const onPreview = vi.fn();
  const { onChange } = renderNumberInput({ value: 7680, onPreview, onCommit });
  act(() =>
    container!.querySelector<HTMLButtonElement>('button[aria-label="Width increase"]')!.click()
  );
  expect(onPreview).toHaveBeenCalledOnce();
  expect(onCommit).toHaveBeenCalledOnce();
  expect(onChange).toHaveBeenCalledExactlyOnceWith(7680);
  act(() =>
    container!.querySelector<HTMLButtonElement>('button[aria-label="Width decrease"]')!.click()
  );
  expect(onCommit).toHaveBeenCalledTimes(2);
  expect(onChange).toHaveBeenCalledTimes(2);
  expect(onChange).toHaveBeenLastCalledWith(7679);
});
