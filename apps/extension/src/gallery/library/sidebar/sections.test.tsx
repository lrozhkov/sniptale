// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import { GalleryFacetFilters, GalleryFolderList } from './sections';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(node: ReactNode) {
  act(() => {
    root?.render(node);
  });
}

function findButton(label: string) {
  return Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes(label)
  );
}

function click(element: Element | null | undefined) {
  if (!(element instanceof HTMLElement)) {
    throw new Error('Expected clickable element');
  }

  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function updateInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

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

it('renders folder actions, highlights the active folder, and forwards selection changes', () => {
  const onFolderFilterChange = vi.fn();

  render(
    <GalleryFolderList
      counts={{ all: 7, export: 1, recording: 2, scenario: 3, screenshot: 4 }}
      folderFilter="recording"
      onFolderFilterChange={onFolderFilterChange}
    />
  );

  const activeButton = findButton(translate('gallery.preview.folderRecording'));
  expect(activeButton?.className).toContain('shadow-sm');
  expect(container?.textContent).toContain('7');
  expect(findButton(translate('gallery.preview.folderExport'))).toBeUndefined();
  expect(translate('gallery.preview.folderWebSnapshot')).toBe('Веб-снимки');
  expect(container?.textContent).toContain('Веб-снимки');

  click(findButton(translate('gallery.preview.folderScenario')));
  expect(onFolderFilterChange).toHaveBeenCalledWith('scenario');

  render(
    <GalleryFolderList
      counts={{ all: 8, export: 1, recording: 2, scenario: 3, screenshot: 4, 'web-snapshot': 5 }}
      folderFilter="web-snapshot"
      onFolderFilterChange={onFolderFilterChange}
    />
  );

  expect(findButton(translate('gallery.preview.folderWebSnapshot'))?.textContent).toContain('5');
  expect(translate('gallery.preview.kindWebSnapshot')).toBe('Веб-снимок');
});

it('renders searchable facet groups and forwards tag, status, and range selections', () => {
  const onActiveTagsChange = vi.fn();
  const onFacetFilterChange = vi.fn();
  const onResetFilters = vi.fn();
  const onScopeChange = vi.fn();

  render(
    <GalleryFacetFilters
      activeTags={['beta']}
      allTags={['alpha', 'beta']}
      counts={{ all: 2, export: 0, recording: 0, scenario: 0, screenshot: 2 }}
      facetFilters={{
        created: [],
        duration: [],
        format: [],
        resolution: [],
        size: [],
        source: [],
        updated: [],
      }}
      facets={[
        {
          id: 'status',
          searchable: false,
          options: [
            { count: 1, label: 'Сохранённые', value: 'library' },
            { count: 1, label: 'Черновики', value: 'temporary' },
          ],
        },
        {
          id: 'tags',
          searchable: true,
          options: [
            { count: 1, label: 'alpha', value: 'alpha' },
            { count: 1, label: 'beta', value: 'beta' },
          ],
        },
        {
          id: 'size',
          searchable: false,
          options: [{ count: 2, label: 'До 1 МБ', value: 'small' }],
        },
      ]}
      folderFilter="all"
      scope="all"
      onActiveTagsChange={onActiveTagsChange}
      onFacetFilterChange={onFacetFilterChange}
      onFolderFilterChange={vi.fn()}
      onResetFilters={onResetFilters}
      onScopeChange={onScopeChange}
    />
  );

  const initialSummaries = Array.from(container?.querySelectorAll('summary') ?? []);
  expect(initialSummaries[0]?.textContent).toContain(`${translate('gallery.app.facetSelected')} 2`);
  expect(initialSummaries[1]?.textContent).toContain('beta');
  expect(initialSummaries[1]?.textContent).not.toContain(
    `${translate('gallery.app.facetSelected')} 1`
  );

  const labels = Array.from(container?.querySelectorAll('label') ?? []);
  click(labels.find((label) => label.textContent?.includes('alpha')));
  click(labels.find((label) => label.textContent?.includes('Сохранённые')));
  click(container?.querySelectorAll('summary')[2]);
  const sizeLabel = Array.from(container?.querySelectorAll('label') ?? []).find((label) =>
    label.textContent?.includes('До 1 МБ')
  );
  click(sizeLabel);

  expect(onActiveTagsChange).toHaveBeenCalledWith(['beta', 'alpha']);
  expect(onScopeChange).toHaveBeenCalledWith('temporary');
  expect(onFacetFilterChange).toHaveBeenCalledWith('size', ['small']);
  expect(container?.textContent).toContain(`${translate('gallery.app.facetSelected')} 2`);

  click(
    container?.querySelector(
      `[aria-label="${translate('gallery.app.facetClear')} ${translate('gallery.app.facetTitle.tags')}"]`
    )
  );
  click(findButton(translate('gallery.app.facetResetAll')));

  expect(onActiveTagsChange).toHaveBeenLastCalledWith([]);
  expect(onResetFilters).toHaveBeenCalledTimes(1);
  expect(
    container?.querySelector(
      `[aria-label="${translate('gallery.app.facetClear')} ${translate('gallery.app.facetTitle.status')}"]`
    )
  ).toBeNull();
});

it('shows search and scrolling only for facet lists with more than ten values', () => {
  const options = Array.from({ length: 11 }, (_, index) => ({
    count: 1,
    label: `tag-${index}`,
    value: `tag-${index}`,
  }));

  render(
    <GalleryFacetFilters
      activeTags={[]}
      allTags={options.map((option) => option.value)}
      counts={{ all: 11, export: 0, recording: 0, scenario: 0, screenshot: 11 }}
      facetFilters={{
        created: [],
        duration: [],
        format: [],
        resolution: [],
        size: [],
        source: [],
        updated: [],
      }}
      facets={[{ id: 'tags', searchable: true, options }]}
      folderFilter="all"
      scope="all"
      onActiveTagsChange={vi.fn()}
      onFacetFilterChange={vi.fn()}
      onFolderFilterChange={vi.fn()}
      onResetFilters={vi.fn()}
      onScopeChange={vi.fn()}
    />
  );

  const searchInput = container?.querySelector<HTMLInputElement>(
    `input[placeholder="${translate('gallery.app.facetSearch')}"]`
  );
  if (!searchInput) throw new Error('Expected facet search input');

  expect(
    container?.querySelector(`[aria-label="${translate('gallery.app.facetClearSearch')}"]`)
  ).toBeNull();
  expect(container?.querySelector('.max-h-56')?.className).toContain('overflow-y-auto');
  expect(findButton(translate('gallery.app.facetResetAll'))).toBeUndefined();

  act(() => updateInputValue(searchInput, 'tag-10'));

  expect(container?.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
  click(container?.querySelector(`[aria-label="${translate('gallery.app.facetClearSearch')}"]`));

  expect(searchInput.value).toBe('');
  expect(container?.querySelectorAll('input[type="checkbox"]')).toHaveLength(11);
});
