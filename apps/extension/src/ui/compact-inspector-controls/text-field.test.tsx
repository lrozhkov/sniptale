// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { TextField } from './text-field';
import { InspectorLayout } from './layout';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderFields(onValueCommit = vi.fn()) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <div data-ui="shared.ui.compact-inspector.panel">
        <TextField
          label="Title"
          defaultValue="Scene"
          onValueCommit={onValueCommit}
          readOnly={false}
        />
        <TextField label="URL" defaultValue="https://sniptale.dev" readOnly={false} />
      </div>
    );
  });

  return {
    first: container.querySelector<HTMLInputElement>('input[aria-label="Title"]'),
    second: container.querySelector<HTMLInputElement>('input[aria-label="URL"]'),
    onValueCommit,
  };
}

function setInputValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function getTextFieldEditingState(input: HTMLInputElement): string | null | undefined {
  return input
    .closest('[data-ui="shared.ui.compact-inspector.text-field"]')
    ?.getAttribute('data-editing');
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('forwards numeric wheel editing while keeping native text defaults and blur acceptance', () => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const commit = vi.fn();
  const change = vi.fn();
  act(() =>
    root?.render(
      <>
        <TextField
          label="Seed"
          type="number"
          min={0}
          max={10}
          defaultValue="4"
          onChange={change}
          onValueCommit={commit}
        />
        <TextField label="Name" defaultValue="123" />
      </>
    )
  );
  const seed = container.querySelector<HTMLInputElement>('[aria-label="Seed"]')!;
  const name = container.querySelector<HTMLInputElement>('[aria-label="Name"]')!;
  expect(name.type).toBe('text');
  act(() => seed.focus());
  const wheel = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaY: -1,
    altKey: true,
  });
  act(() => seed.dispatchEvent(wheel));
  expect(seed.value).toBe('5');
  expect(change).toHaveBeenCalledOnce();
  expect(commit).not.toHaveBeenCalled();
  expect(wheel.defaultPrevented).toBe(true);
  act(() => name.focus());
  expect(commit).toHaveBeenCalledExactlyOnceWith('5');
  const textWheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -1 });
  act(() => name.dispatchEvent(textWheel));
  expect(textWheel.defaultPrevented).toBe(false);
  expect(name.value).toBe('123');
});

it('commits text edits and focuses the next compact input on Enter', () => {
  const { first, second, onValueCommit } = renderFields();
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  if (!first || !second) {
    return;
  }

  act(() => {
    first.focus();
    setInputValue(first, 'Updated scene');
    expect(getTextFieldEditingState(first)).toBe('true');
    first.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });

  expect(onValueCommit).toHaveBeenCalledWith('Updated scene');
  expect(document.activeElement).toBe(second);
  expect(getTextFieldEditingState(first)).toBe('false');
});

it('deduplicates blur commits and blurs the field on Escape', () => {
  const { first, onValueCommit } = renderFields();
  expect(first).not.toBeNull();
  if (!first) {
    return;
  }

  act(() => {
    first.focus();
    setInputValue(first, 'Same value');
    first.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    first.focus();
    first.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  });

  expect(onValueCommit).toHaveBeenCalledTimes(1);
  expect(document.activeElement).not.toBe(first);
});

it.each([false, true])(
  'provides a readable empty hint and preserves explicit examples (inspector=%s)',
  (inspector) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const fields = (
      <>
        <TextField label="Title" />
        <TextField label="URL" placeholder="example.com" />
      </>
    );
    act(() => root?.render(inspector ? <InspectorLayout>{fields}</InspectorLayout> : fields));
    expect(
      container.querySelector<HTMLInputElement>('input[aria-label="Title"]')?.placeholder
    ).toBe('Title');
    expect(container.querySelector<HTMLInputElement>('input[aria-label="URL"]')?.placeholder).toBe(
      'example.com'
    );
  }
);
