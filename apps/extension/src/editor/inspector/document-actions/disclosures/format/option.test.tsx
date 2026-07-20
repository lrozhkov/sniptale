// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { EditorDocumentExportPreferencesFormatOption } from './option';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('renders the format option button and forwards selection events', () => {
  const onSelect = vi.fn();

  act(() => {
    root?.render(
      <EditorDocumentExportPreferencesFormatOption
        isSelected
        onSelect={onSelect}
        option={{ label: 'PNG', value: 'png' }}
      />
    );
  });

  const button = container?.querySelector<HTMLButtonElement>('button');
  expect(button?.textContent).toContain('PNG');
  expect(button?.getAttribute('aria-pressed')).toBe('true');
  expect(button?.className).toContain('border-[color:var(--sniptale-color-border-strong)]');
  expect(button?.className).toContain('text-[color:var(--sniptale-color-text-primary)]');
  expect(button?.className).not.toContain('shadow-[inset_0_-2px_0_var(--sniptale-color-accent)]');

  act(() => {
    button?.click();
  });

  expect(onSelect).toHaveBeenCalledTimes(1);
});
