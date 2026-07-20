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
