// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { EditorInspectorFrameModeButtons } from './modes';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderUi(element: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(element);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

it('renders frame modes as directly selectable chips', async () => {
  const onChange = vi.fn();

  await renderUi(
    <EditorInspectorFrameModeButtons
      ariaLabel="Placement"
      options={[
        { value: 'fit-image', label: 'Fit image' },
        { value: 'expand-canvas', label: 'Expand canvas' },
      ]}
      value="fit-image"
      onChange={onChange}
    />
  );

  expect(container?.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Placement');
  expect(container?.querySelectorAll('button')).toHaveLength(2);
  expect(container?.querySelector('button')?.getAttribute('aria-pressed')).toBe('true');

  await act(async () => {
    (
      Array.from(container?.querySelectorAll('button') ?? []).find(
        (button) => button.textContent === 'Expand canvas'
      ) as HTMLButtonElement | undefined
    )?.click();
  });

  expect(onChange).toHaveBeenCalledWith('expand-canvas');
});

it('keeps long three-option mode labels in one option grid', async () => {
  await renderUi(
    <EditorInspectorFrameModeButtons
      ariaLabel="Background mode"
      options={[
        { value: 'fit-image', label: 'Fit image' },
        { value: 'expand-canvas', label: 'Expand canvas' },
        { value: 'custom', label: 'Custom' },
      ]}
      value="custom"
      onChange={vi.fn()}
    />
  );

  expect(container?.querySelectorAll('button')).toHaveLength(3);
  expect(
    Array.from(container?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent === 'Custom')
      ?.getAttribute('aria-pressed')
  ).toBe('true');
});

it('keeps the option grid accessible for unlabeled legacy callers', async () => {
  await renderUi(
    <EditorInspectorFrameModeButtons
      options={[
        { value: 'fit-image', label: 'Fit image' },
        { value: 'expand-canvas', label: 'Expand canvas' },
      ]}
      value="fit-image"
      onChange={vi.fn()}
    />
  );

  expect(container?.querySelector('[role="group"]')).not.toBeNull();
  expect(container?.querySelectorAll('button')).toHaveLength(2);
});
