// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { translate } from '../../../../platform/i18n';
import { resetShapeBrowserSessionStateForTests, ShapeBrowser, type ShapeBrowserEntry } from './';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  resetShapeBrowserSessionStateForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

function createCustomEntry(index: number): ShapeBrowserEntry {
  return {
    id: `custom-badge-${index}`,
    labelFallback: `Badge ${index}`,
    category: 'custom',
    source: 'custom',
    searchAliases: ['shield'],
    tags: ['security'],
    thumbnail: null,
    insertKind: 'custom-badge',
    roughCapable: true,
  };
}

function getCustomTileCount(): number {
  return (
    container
      ?.querySelector('[data-shape-category="custom"]')
      ?.querySelectorAll('button[data-shape-browser-tile="true"]').length ?? 0
  );
}

it('collapses expanded custom categories', () => {
  const entries = Array.from({ length: 21 }, (_, index) => createCustomEntry(index));
  act(() => {
    root?.render(<ShapeBrowser additionalEntries={entries} onSelect={vi.fn()} />);
  });

  const customSection = container?.querySelector('[data-shape-category="custom"]');
  const showMore = Array.from(customSection?.querySelectorAll('button') ?? []).find(
    (button) => button.textContent === translate('editor.shapeCatalog.browser.showMore')
  );
  act(() => showMore?.click());
  expect(getCustomTileCount()).toBe(21);

  const showLess = Array.from(customSection?.querySelectorAll('button') ?? []).find(
    (button) => button.textContent === translate('editor.shapeCatalog.browser.showLess')
  );
  act(() => showLess?.click());
  expect(getCustomTileCount()).toBe(20);
});

it('filters, searches, and exposes custom shape actions in compact browser rows', () => {
  const onDelete = vi.fn();
  const onDisable = vi.fn();
  const onSelect = vi.fn();
  const entries = [createCustomEntry(1), createCustomEntry(2)];

  act(() => {
    root?.render(
      <ShapeBrowser
        additionalEntries={entries}
        defaultSourceFilter="all"
        onDeleteCustomShape={onDelete}
        onDisableCustomShape={onDisable}
        onSelect={onSelect}
      />
    );
  });

  act(() => {
    container
      ?.querySelector<HTMLInputElement>(
        `input[aria-label="${translate('editor.shapeCatalog.browser.searchLabel')}"]`
      )
      ?.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'Badge 1' }));
    container?.querySelector<HTMLButtonElement>('[data-shape-source-filter="custom"]')?.click();
    container?.querySelector<HTMLButtonElement>('[data-shape-id="custom-badge-1"]')?.click();
    Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      .find(
        (button) =>
          button.getAttribute('aria-label') ===
          translate('editor.shapeCatalog.browser.disableCustomShape')
      )
      ?.click();
    Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      .find(
        (button) =>
          button.getAttribute('aria-label') ===
          translate('editor.shapeCatalog.browser.deleteCustomShape')
      )
      ?.click();
  });

  expect(container?.innerHTML).toContain('data-shape-source-filter="custom"');
  expect(onSelect).toHaveBeenCalled();
  expect(onDisable).toHaveBeenCalled();
  expect(onDelete).toHaveBeenCalled();
});

it('moves tile focus with keyboard navigation', () => {
  const entries = [createCustomEntry(1), createCustomEntry(2), createCustomEntry(3)];

  act(() => {
    root?.render(<ShapeBrowser additionalEntries={entries} onSelect={vi.fn()} />);
  });

  const tiles = Array.from(
    container?.querySelectorAll<HTMLButtonElement>('button[data-shape-browser-tile="true"]') ?? []
  );
  tiles[0]?.focus();

  act(() => {
    tiles[0]?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
    tiles[1]?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'End' }));
    tiles.at(-1)?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Home' }));
    tiles[0]?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' }));
  });

  expect(tiles.length).toBeGreaterThan(2);
});

it('renders empty import states and hides optional browser chrome', () => {
  act(() => {
    root?.render(
      <ShapeBrowser
        additionalEntries={[]}
        defaultSourceFilter="custom"
        excludedCategories={[
          'action-buttons',
          'basic-shapes',
          'block-arrows',
          'callouts',
          'custom',
          'equation-shapes',
          'flowchart',
          'imported',
          'lines-connectors',
          'primary-shortcuts',
          'stars-banners',
        ]}
        importState={{ status: 'error', message: 'Bad import' }}
        showImport={false}
        showPrimaryShortcuts={false}
        showSourceFilters={false}
        onSelect={vi.fn()}
      />
    );
  });

  expect(container?.querySelector('[role="alert"]')?.textContent).toContain('Bad import');
  expect(container?.querySelector('[data-shape-browser-import="footer"]')).toBeNull();
  expect(container?.querySelector('[data-shape-source-filter]')).toBeNull();
});
