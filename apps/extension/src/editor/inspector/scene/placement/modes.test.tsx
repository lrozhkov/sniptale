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

it('renders frame modes through the compact select field', async () => {
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

  expect(
    container?.querySelector('[data-ui="shared.ui.compact-inspector.select-field"]')
  ).not.toBeNull();
  expect(container?.querySelector('button')?.getAttribute('title')).toBe('Fit image');

  await act(async () => {
    container?.querySelector('button')?.click();
  });
  await act(async () => {
    (
      Array.from(document.body.querySelectorAll('button')).find(
        (button) => button.textContent === 'Expand canvas'
      ) as HTMLButtonElement | undefined
    )?.click();
  });

  expect(onChange).toHaveBeenCalledWith('expand-canvas');
});

it('keeps long three-option mode labels in the same select shell', async () => {
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

  expect(
    container?.querySelector('[data-ui="shared.ui.compact-inspector.select-field"]')
  ).not.toBeNull();
  expect(container?.querySelector('button')?.getAttribute('title')).toBe('Custom');
});

it('falls back to an empty compact select label for unlabeled legacy callers', async () => {
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

  expect(
    container?.querySelector('[data-ui="shared.ui.compact-inspector.select-field"]')
  ).not.toBeNull();
});
