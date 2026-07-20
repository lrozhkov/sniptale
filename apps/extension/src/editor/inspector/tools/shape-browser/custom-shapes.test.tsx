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

function createCustomEntry(): ShapeBrowserEntry {
  return {
    id: 'custom-badge',
    labelFallback: 'Badge shield',
    category: 'custom',
    source: 'custom',
    searchAliases: ['shield'],
    tags: ['security'],
    thumbnail: null,
    insertKind: 'custom-badge',
    roughCapable: true,
  };
}

function createImportedEntry(): ShapeBrowserEntry {
  return {
    ...createCustomEntry(),
    id: 'custom-imported-flow',
    category: 'imported',
    source: 'imported-library',
  };
}

it('searches custom shape imports and routes disable/delete actions', () => {
  const customEntry = createCustomEntry();
  const onDisableCustomShape = vi.fn();
  const onDeleteCustomShape = vi.fn();

  act(() => {
    root?.render(
      <ShapeBrowser
        additionalEntries={[customEntry]}
        onDeleteCustomShape={onDeleteCustomShape}
        onDisableCustomShape={onDisableCustomShape}
        onSelect={vi.fn()}
      />
    );
  });
  act(() => {
    getButton('button[data-shape-source-filter="custom"]').click();
  });
  setSearchValue('security');

  expect(container?.querySelector('[data-shape-id="custom-badge"]')).not.toBeNull();

  act(() => {
    getButton(
      `button[aria-label="${translate('editor.shapeCatalog.browser.disableCustomShape')}"]`
    ).click();
    getButton(
      `button[aria-label="${translate('editor.shapeCatalog.browser.deleteCustomShape')}"]`
    ).click();
  });

  expect(onDisableCustomShape).toHaveBeenCalledWith(customEntry);
  expect(onDeleteCustomShape).toHaveBeenCalledWith(customEntry);
});

it('routes imported library entries through the same disable/delete actions', () => {
  const importedEntry = createImportedEntry();
  const onDisableCustomShape = vi.fn();
  const onDeleteCustomShape = vi.fn();

  act(() => {
    root?.render(
      <ShapeBrowser
        additionalEntries={[importedEntry]}
        onDeleteCustomShape={onDeleteCustomShape}
        onDisableCustomShape={onDisableCustomShape}
        onSelect={vi.fn()}
      />
    );
  });
  act(() => {
    getButton('button[data-shape-source-filter="imported-library"]').click();
  });

  expect(container?.querySelector('[data-shape-id="custom-imported-flow"]')).not.toBeNull();

  act(() => {
    getButton(
      `button[aria-label="${translate('editor.shapeCatalog.browser.disableCustomShape')}"]`
    ).click();
    getButton(
      `button[aria-label="${translate('editor.shapeCatalog.browser.deleteCustomShape')}"]`
    ).click();
  });

  expect(onDisableCustomShape).toHaveBeenCalledWith(importedEntry);
  expect(onDeleteCustomShape).toHaveBeenCalledWith(importedEntry);
});

it('routes manual import file changes and shows custom import errors', () => {
  const onImportFile = vi.fn();
  const file = { name: 'badge.svg' } as File;

  act(() => {
    root?.render(
      <ShapeBrowser
        importState={{ status: 'error', message: 'bad svg' }}
        onImportFile={onImportFile}
        onSelect={vi.fn()}
      />
    );
  });

  const input = container?.querySelector<HTMLInputElement>(
    `input[aria-label="${translate('editor.shapeCatalog.browser.importCustomShape')}"]`
  );
  expect(input).toBeDefined();
  expect(input?.getAttribute('accept')).toContain('.excalidrawlib');
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  act(() => {
    input?.dispatchEvent(new Event('change', { bubbles: true }));
  });

  act(() => {
    getButton('button[data-shape-source-filter="custom"]').click();
  });

  expect(onImportFile).toHaveBeenCalledWith(file);
  expect(container?.textContent).toContain(
    translate('editor.shapeCatalog.browser.customErrorTitle')
  );
  expect(container?.textContent).toContain('bad svg');
});

it('shows localized import diagnostics for partial library imports', () => {
  act(() => {
    root?.render(
      <ShapeBrowser
        importState={{
          status: 'ready',
          summary: {
            diagnostics: [
              { code: 'unsupported-element', severity: 'warning' },
              { code: 'skipped-element', severity: 'warning' },
            ],
            importedCount: 2,
            libraryName: 'Workflow',
            skippedCount: 1,
            sourceFileName: 'workflow.excalidrawlib',
            unsupportedCount: 1,
            validationErrorCount: 0,
          },
        }}
        onSelect={vi.fn()}
      />
    );
  });

  expect(container?.textContent).toContain(
    translate('editor.shapeCatalog.browser.importDiagnosticsTitle')
  );
  expect(container?.textContent).toContain('workflow.excalidrawlib');
  expect(container?.textContent).toContain('Workflow');
  expect(container?.textContent).toContain(translate('editor.shapeCatalog.browser.importedCount'));
  expect(container?.textContent).toContain(
    translate('editor.shapeCatalog.browser.unsupportedCount')
  );
  expect(container?.textContent).toContain(
    translate('editor.shapeCatalog.browser.diagnostic.unsupportedElement')
  );
});

it('keeps focus unchanged when browser arrow keys start outside shape tiles', () => {
  act(() => {
    root?.render(<ShapeBrowser onSelect={vi.fn()} />);
  });

  const input = container?.querySelector<HTMLInputElement>(
    `input[aria-label="${translate('editor.shapeCatalog.browser.searchLabel')}"]`
  );
  expect(input).toBeDefined();
  input?.focus();
  act(() => {
    input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  });

  expect(document.activeElement).toBe(input);
});

it('moves tile focus with browser keyboard navigation', () => {
  act(() => {
    root?.render(<ShapeBrowser onSelect={vi.fn()} />);
  });
  const tiles = () =>
    Array.from(
      container?.querySelectorAll<HTMLButtonElement>('button[data-shape-browser-tile="true"]') ?? []
    );
  const firstTile = tiles()[0];
  expect(firstTile).toBeDefined();

  firstTile?.focus();
  act(() => {
    firstTile?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  });
  expect(document.activeElement).toBe(tiles()[1]);

  act(() => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })
    );
  });
  expect(document.activeElement).toBe(firstTile);

  act(() => {
    firstTile?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  });
  expect(document.activeElement).toBe(tiles().at(-1));

  act(() => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true })
    );
  });
  expect(document.activeElement).toBe(firstTile);
});
