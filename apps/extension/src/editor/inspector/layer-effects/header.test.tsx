// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../chrome/ui')>()),
  SearchField: (props: Record<string, unknown>) => (
    <button
      type="button"
      aria-label={String(props['label'] ?? '')}
      data-placeholder={String(props['placeholder'] ?? '')}
      onClick={() => (props['onChange'] as ((value: string) => void) | undefined)?.('blur')}
    >
      search
    </button>
  ),
}));

vi.mock('../tools/sections', () => ({
  CollapsibleSection: (props: { children: React.ReactNode }) => <section>{props.children}</section>,
  HeaderValueToggleSection: () => null,
  PanelSection: (props: { children: React.ReactNode; label: string; value: string }) => (
    <section data-label={props.label} data-value={props.value}>
      {props.children}
    </section>
  ),
  renderSelectionActionsSectionWithController: () => null,
}));

import { LayerEffectsHeader } from './header';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderHeader(category: 'adjustments' | 'filters' | 'transformations' = 'adjustments') {
  const setQuery = vi.fn();

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<LayerEffectsHeader category={category} query="" setQuery={setQuery} />));

  return { setQuery };
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

it('renders standalone search for searchable categories and forwards query changes', () => {
  const { setQuery } = renderHeader();
  const input = container?.querySelector('button[data-placeholder]') as HTMLButtonElement | null;

  expect(
    container?.querySelector('[data-label="editor.toolbar.layerEffectsAdjustments"]')
  ).toBeNull();
  expect(input?.getAttribute('data-placeholder')).toBe(
    'editor.toolbar.layerEffectsSearchPlaceholder'
  );
  expect(input?.getAttribute('aria-label')).toBe('editor.toolbar.layerEffectsSearchPlaceholder');

  act(() => input?.click());

  expect(setQuery).toHaveBeenCalledWith('blur');
});

it('hides the search field for transformation-only layout', () => {
  renderHeader('transformations');

  expect(
    container?.querySelector('[data-label="editor.toolbar.layerEffectsTransformations"]')
  ).toBeNull();
  expect(container?.querySelector('button[data-placeholder]')).toBeNull();
});
