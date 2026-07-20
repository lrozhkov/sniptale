// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { TextField } from './text-field';

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
