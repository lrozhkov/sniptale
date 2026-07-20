// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { translate } from '../../../../platform/i18n';
import {
  createBuiltInShapeBrowserEntries,
  filterShapeBrowserEntries,
  groupShapeBrowserEntries,
  resetShapeBrowserSessionStateForTests,
  ShapeBrowser,
  type ShapeBrowserEntry,
  type ShapeBrowserProps,
} from './';
import { createCustomShapeBrowserEntry } from './index.test-support';
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
function renderBrowser(
  props: {
    additionalEntries?: readonly ShapeBrowserEntry[];
    importState?: ShapeBrowserProps['importState'];
    onSelect?: (entry: ShapeBrowserEntry) => void;
  } = {}
) {
  const onSelect = props.onSelect ?? vi.fn();
  const browserProps: ShapeBrowserProps = { onSelect };
  if (props.additionalEntries !== undefined) {
    browserProps.additionalEntries = props.additionalEntries;
  }
  if (props.importState !== undefined) {
    browserProps.importState = props.importState;
  }

  act(() => {
    root?.render(<ShapeBrowser {...browserProps} />);
  });
  return { onSelect };
}
function getButton(selector: string): HTMLButtonElement {
  const button = container?.querySelector<HTMLButtonElement>(selector);
  expect(button).toBeDefined();
  return button as HTMLButtonElement;
}
function setSearchValue(value: string): void {
  const input = container?.querySelector<HTMLInputElement>(
    `input[aria-label="${translate('editor.shapeCatalog.browser.searchLabel')}"]`
  );
  expect(input).toBeDefined();
  act(() => {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    valueSetter?.call(input, value);
    input!.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function clickSourceFilter(filter: string): void {
  act(() => {
    getButton(`button[data-shape-source-filter="${filter}"]`).click();
  });
}
describe('editor shape browser', () => {
  it('groups built-in office catalog entries in stable category order', () => {
    const groups = groupShapeBrowserEntries(createBuiltInShapeBrowserEntries());

    expect(groups.slice(0, 8).map((group) => group.category)).toEqual([
      'lines-connectors',
      'basic-shapes',
      'block-arrows',
      'equation-shapes',
      'flowchart',
      'callouts',
      'stars-banners',
      'action-buttons',
    ]);
  });
});

describe('editor shape browser search and filtering', () => {
  it('searches by localized labels and Russian or English aliases', () => {
    const entries = createBuiltInShapeBrowserEntries();
    renderBrowser();
    setSearchValue('круг');

    expect(filterShapeBrowserEntries({ entries, query: 'круг', sourceFilter: 'all' })).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'oval' })])
    );
    expect(filterShapeBrowserEntries({ entries, query: 'rhombus', sourceFilter: 'all' })).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'diamond' })])
    );
    expect(
      container?.querySelector('[data-shape-category] button[data-shape-id="oval"]')
    ).not.toBeNull();
    expect(
      container?.querySelector('[data-shape-category] button[data-shape-id="diamond"]')
    ).toBeNull();
  });

  it('filters custom and imported sources without mixing built-in entries', () => {
    const customEntry = createCustomShapeBrowserEntry();
    const importedEntry = createCustomShapeBrowserEntry({
      id: 'library-flow',
      category: 'imported',
      source: 'imported-library',
      insertKind: 'excalidraw-library-item',
      labelFallback: 'Library flow',
    });
    const entries = [customEntry, importedEntry];

    expect(filterShapeBrowserEntries({ entries, query: 'widget', sourceFilter: 'custom' })).toEqual(
      [customEntry]
    );
    expect(
      filterShapeBrowserEntries({ entries, query: 'flow', sourceFilter: 'imported-library' })
    ).toEqual([importedEntry]);
  });
});

describe('editor shape browser selection', () => {
  it('routes primary shortcut selection with the expected catalog shape kind', () => {
    const onSelect = vi.fn();
    renderBrowser({ onSelect });

    act(() => {
      container
        ?.querySelectorAll<HTMLButtonElement>('button[data-shape-id="block-arrow"]')[0]
        ?.click();
    });

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'block-arrow', insertKind: 'right-arrow' })
    );
  });
});

describe('editor shape browser keyboard', () => {
  it('supports keyboard focus movement across shape tiles', () => {
    renderBrowser();
    const lineTile = getButton('button[data-shape-id="line"]');
    const tiles = Array.from(
      container?.querySelectorAll<HTMLButtonElement>('button[data-shape-browser-tile="true"]') ?? []
    );
    const lineIndex = tiles.indexOf(lineTile);

    lineTile.focus();
    act(() => {
      lineTile.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });

    expect(document.activeElement).toBe(tiles[lineIndex + 1]);

    act(() => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })
      );
    });
    expect(document.activeElement).toBe(lineTile);

    act(() => {
      lineTile.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });
    expect(document.activeElement).toBe(tiles.at(-1));

    act(() => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Home', bubbles: true })
      );
    });
    expect(document.activeElement).toBe(tiles[0]);
  });
});

describe('editor shape browser empty states', () => {
  it('renders empty and import validation states', () => {
    renderBrowser();
    clickSourceFilter('custom');

    expect(container?.textContent).toContain(translate('editor.shapeCatalog.browser.emptyTitle'));

    clickSourceFilter('imported-library');
    act(() => {
      root?.render(
        <ShapeBrowser
          importState={{ status: 'error', message: 'Некорректный файл библиотеки' }}
          onSelect={vi.fn()}
        />
      );
    });
    clickSourceFilter('imported-library');

    expect(container?.querySelector('[role="alert"]')?.textContent).toContain(
      'Некорректный файл библиотеки'
    );

    act(() => {
      root?.render(<ShapeBrowser importState={{ status: 'empty' }} onSelect={vi.fn()} />);
    });
    clickSourceFilter('imported-library');
    expect(container?.textContent).toContain(
      translate('editor.shapeCatalog.browser.importEmptyTitle')
    );
  });
});

describe('editor shape browser category expansion', () => {
  it('expands and collapses larger built-in categories', () => {
    const entries = Array.from({ length: 21 }, (_, index) =>
      createCustomShapeBrowserEntry({ id: `custom-${index}` })
    );
    renderBrowser({ additionalEntries: entries });
    const customSection = container?.querySelector('[data-shape-category="custom"]');
    const countCollapsed = customSection?.querySelectorAll(
      'button[data-shape-browser-tile="true"]'
    ).length;

    expect(countCollapsed).toBe(20);

    act(() => {
      Array.from(customSection?.querySelectorAll('button') ?? [])
        .find((button) => button.textContent === translate('editor.shapeCatalog.browser.showMore'))
        ?.click();
    });

    expect(customSection?.querySelectorAll('button[data-shape-browser-tile="true"]').length).toBe(
      21
    );
  });

  it('keeps category expansion hidden until a group has more than twenty entries', () => {
    const entries = Array.from({ length: 20 }, (_, index) =>
      createCustomShapeBrowserEntry({ id: `custom-${index}` })
    );
    renderBrowser({ additionalEntries: entries });
    const customSection = container?.querySelector('[data-shape-category="custom"]');

    expect(customSection?.textContent).not.toContain(
      translate('editor.shapeCatalog.browser.showMore')
    );
  });
});

describe('editor shape browser thumbnails and layout', () => {
  it('uses a deterministic thumbnail fallback for unsupported entries', () => {
    renderBrowser({ additionalEntries: [createCustomShapeBrowserEntry()] });
    clickSourceFilter('custom');

    expect(container?.querySelector('[data-shape-thumbnail-fallback="true"]')).not.toBeNull();
  });

  it('keeps representative browser grids bounded by fixed column classes', () => {
    renderBrowser();

    expect(container?.querySelector('.grid-cols-5')).not.toBeNull();
    expect(
      container?.querySelector('[data-shape-category="basic-shapes"] .grid-cols-5')
    ).not.toBeNull();
  });
});

describe('editor shape browser chrome options', () => {
  it('can hide shortcuts, source filters, and line-like categories for shapes and lines', () => {
    renderBrowser();
    expect(container?.textContent).toContain(
      translate('editor.shapeCatalog.browser.primaryShortcuts')
    );

    act(() => {
      root?.render(
        <ShapeBrowser
          excludedCategories={['lines-connectors']}
          showPrimaryShortcuts={false}
          showSourceFilters={false}
          onSelect={vi.fn()}
        />
      );
    });

    expect(container?.textContent).not.toContain(
      translate('editor.shapeCatalog.browser.primaryShortcuts')
    );
    expect(container?.querySelector('[data-shape-source-filter]')).toBeNull();
    expect(container?.querySelector('[data-shape-category="lines-connectors"]')).toBeNull();
    expect(container?.querySelector('[data-shape-browser-list="true"]')).not.toBeNull();
    expect(container?.querySelector('[data-shape-browser-import="footer"]')).not.toBeNull();
  });
});
