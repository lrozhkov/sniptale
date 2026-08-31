// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import { GallerySavedViewError } from '../../../composition/persistence/gallery-saved-views';
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
  window.localStorage.clear();
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

it('renders saved views under their category without icons or counters and requests deletion', () => {
  const onSavedViewSelect = vi.fn();
  const onDeleteSavedView = vi.fn();
  const onMoveSavedView = vi.fn();
  const view = {
    createdAt: 1,
    filters: {
      activeTags: [],
      facetFilters: {
        created: [],
        duration: [],
        format: ['png'],
        resolution: [],
        size: [],
        source: [],
        updated: [],
      },
      scope: 'all' as const,
    },
    folderFilter: 'screenshot' as const,
    id: 'view-1',
    name: 'PNG review',
    updatedAt: 1,
  };

  render(
    <GalleryFolderList
      activeSavedView={view}
      counts={{ all: 7, export: 0, recording: 0, scenario: 0, screenshot: 4 }}
      folderFilter="screenshot"
      savedViews={[view]}
      savedViewsLoaded
      onDeleteSavedView={onDeleteSavedView}
      onFolderFilterChange={vi.fn()}
      onMoveSavedView={onMoveSavedView}
      onSavedViewSelect={onSavedViewSelect}
    />
  );

  const viewButton = findButton('PNG review');
  expect(viewButton?.querySelector('svg')).toBeNull();
  expect(viewButton?.className).toContain('h-full w-full');
  expect(viewButton?.parentElement?.querySelector('div')?.className).toContain('opacity-0');
  click(viewButton);
  expect(onSavedViewSelect).toHaveBeenCalledWith('view-1');
  click(
    container?.querySelector(
      `[aria-label="${translate('gallery.app.savedViewDelete')} PNG review"]`
    )
  );
  expect(onDeleteSavedView).toHaveBeenCalledWith(view);
});

it('reveals saved views in batches and requests sibling reordering', () => {
  const onMoveSavedView = vi.fn();
  const views = Array.from({ length: 6 }, (_, index) => ({
    createdAt: index + 1,
    filters: {
      activeTags: [],
      facetFilters: {
        created: [],
        duration: [],
        format: [],
        resolution: [],
        size: [],
        source: [],
        updated: [],
      },
      scope: 'all' as const,
    },
    folderFilter: 'screenshot' as const,
    id: `view-${index + 1}`,
    name: `View ${index + 1}`,
    updatedAt: index + 1,
  }));

  render(
    <GalleryFolderList
      counts={{ all: 6, export: 0, recording: 0, scenario: 0, screenshot: 6 }}
      folderFilter="screenshot"
      savedViews={views}
      savedViewsLoaded
      onFolderFilterChange={vi.fn()}
      onMoveSavedView={onMoveSavedView}
      onSavedViewSelect={vi.fn()}
    />
  );

  expect(findButton('View 5')).toBeDefined();
  expect(findButton('View 6')).toBeUndefined();
  click(findButton(translate('gallery.app.savedViewShowMore')));
  expect(findButton('View 6')).toBeDefined();

  const moveButton = container?.querySelector<HTMLButtonElement>(
    `[aria-label="${translate('gallery.app.savedViewMoveUp')} View 6"]`
  );
  moveButton?.focus();
  expect(document.activeElement).toBe(moveButton);
  click(moveButton);
  expect(onMoveSavedView).toHaveBeenCalledWith('view-6', 'up');
  expect(document.activeElement).not.toBe(moveButton);
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
      filteredItemCount={2}
      scope="all"
      onActiveTagsChange={onActiveTagsChange}
      onFacetFilterChange={onFacetFilterChange}
      onFolderFilterChange={vi.fn()}
      onSelectAll={vi.fn()}
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
  expect(container?.textContent).toContain(`${translate('gallery.app.facetResults')}: 2`);
  expect(findButton(translate('gallery.app.selectAllResults'))).toBeDefined();

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

it('opens a compact saved-view name field, reports a conflict, and confirms creation', async () => {
  const createdView = (name: string) => ({
    createdAt: 1,
    filters: {
      activeTags: [],
      facetFilters: {
        created: [],
        duration: [],
        format: ['png'],
        resolution: [],
        size: [],
        source: [],
        updated: [],
      },
      scope: 'all' as const,
    },
    folderFilter: 'screenshot' as const,
    id: 'view-1',
    name,
    updatedAt: 1,
  });
  const onCreateSavedView = vi
    .fn()
    .mockRejectedValueOnce(new GallerySavedViewError('conflict', 'duplicate'))
    .mockImplementation(async (name: string) => createdView(name));
  render(
    <GalleryFacetFilters
      activeSavedView={null}
      activeTags={[]}
      allTags={[]}
      counts={{ all: 1, export: 0, recording: 0, scenario: 0, screenshot: 1 }}
      facetFilters={{
        created: [],
        duration: [],
        format: ['png'],
        resolution: [],
        size: [],
        source: [],
        updated: [],
      }}
      facets={[]}
      filteredItemCount={1}
      folderFilter="screenshot"
      scope="all"
      onActiveTagsChange={vi.fn()}
      onCreateSavedView={onCreateSavedView}
      onFacetFilterChange={vi.fn()}
      onFolderFilterChange={vi.fn()}
      onResetFilters={vi.fn()}
      onScopeChange={vi.fn()}
      onSelectAll={vi.fn()}
    />
  );

  click(findButton(translate('gallery.app.savedViewSave')));
  const input = container?.querySelector<HTMLInputElement>(
    `[aria-label="${translate('gallery.app.savedViewName')}"]`
  );
  expect(input).not.toBeNull();
  act(() => updateInputValue(input!, 'Review PNG'));
  click(container?.querySelector(`[aria-label="${translate('gallery.app.savedViewConfirm')}"]`));

  await vi.waitFor(() => expect(onCreateSavedView).toHaveBeenCalledWith('Review PNG'));
  await vi.waitFor(() =>
    expect(container?.textContent).toContain(translate('gallery.app.savedViewNameConflict'))
  );
  click(container?.querySelector(`[aria-label="${translate('gallery.app.savedViewConfirm')}"]`));
  await vi.waitFor(() => expect(onCreateSavedView).toHaveBeenCalledTimes(2));
});

it('updates a changed active saved view instead of opening the name field', async () => {
  const onUpdateSavedView = vi.fn(async () => undefined);
  const view = {
    createdAt: 1,
    filters: {
      activeTags: [],
      facetFilters: {
        created: [],
        duration: [],
        format: ['png'],
        resolution: [],
        size: [],
        source: [],
        updated: [],
      },
      scope: 'all' as const,
    },
    folderFilter: 'screenshot' as const,
    id: 'view-1',
    name: 'PNG',
    updatedAt: 1,
  };
  render(
    <GalleryFacetFilters
      activeSavedView={view}
      activeTags={[]}
      allTags={[]}
      counts={{ all: 1, export: 0, recording: 0, scenario: 0, screenshot: 1 }}
      facetFilters={{
        created: [],
        duration: [],
        format: [],
        resolution: [],
        size: [],
        source: [],
        updated: [],
      }}
      facets={[]}
      filteredItemCount={1}
      folderFilter="screenshot"
      isSavedViewDirty
      scope="all"
      onActiveTagsChange={vi.fn()}
      onFacetFilterChange={vi.fn()}
      onFolderFilterChange={vi.fn()}
      onResetFilters={vi.fn()}
      onScopeChange={vi.fn()}
      onSelectAll={vi.fn()}
      onUpdateSavedView={onUpdateSavedView}
    />
  );

  click(findButton(translate('gallery.app.savedViewUpdate')));
  await vi.waitFor(() => expect(onUpdateSavedView).toHaveBeenCalledOnce());
  expect(
    container?.querySelector(`[aria-label="${translate('gallery.app.savedViewName')}"]`)
  ).toBeNull();
});

it('hides reset and update actions while the active saved view matches its baseline', () => {
  const view = {
    createdAt: 1,
    filters: {
      activeTags: ['review'],
      facetFilters: {
        created: [],
        duration: [],
        format: ['png'],
        resolution: [],
        size: [],
        source: [],
        updated: [],
      },
      scope: 'library' as const,
    },
    folderFilter: 'screenshot' as const,
    id: 'view-1',
    name: 'Review PNG',
    updatedAt: 1,
  };

  render(
    <GalleryFacetFilters
      activeSavedView={view}
      activeTags={view.filters.activeTags}
      allTags={['review']}
      counts={{ all: 1, export: 0, recording: 0, scenario: 0, screenshot: 1 }}
      facetFilters={view.filters.facetFilters}
      facets={[]}
      filteredItemCount={1}
      folderFilter="screenshot"
      isSavedViewDirty={false}
      scope={view.filters.scope}
      onActiveTagsChange={vi.fn()}
      onFacetFilterChange={vi.fn()}
      onFolderFilterChange={vi.fn()}
      onResetFilters={vi.fn()}
      onScopeChange={vi.fn()}
      onSelectAll={vi.fn()}
      onUpdateSavedView={vi.fn()}
    />
  );

  expect(findButton(translate('gallery.app.facetResetAll'))).toBeUndefined();
  expect(findButton(translate('gallery.app.savedViewUpdate'))).toBeUndefined();
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
      filteredItemCount={11}
      folderFilter="all"
      scope="all"
      onActiveTagsChange={vi.fn()}
      onFacetFilterChange={vi.fn()}
      onFolderFilterChange={vi.fn()}
      onResetFilters={vi.fn()}
      onSelectAll={vi.fn()}
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

it('shows result selection for a non-default section without a redundant filter reset', () => {
  const onSelectAll = vi.fn();
  render(
    <GalleryFacetFilters
      activeTags={[]}
      allTags={[]}
      counts={{ all: 3, export: 0, recording: 0, scenario: 0, screenshot: 3 }}
      facetFilters={{
        created: [],
        duration: [],
        format: [],
        resolution: [],
        size: [],
        source: [],
        updated: [],
      }}
      facets={[]}
      filteredItemCount={3}
      folderFilter="screenshot"
      scope="all"
      onActiveTagsChange={vi.fn()}
      onFacetFilterChange={vi.fn()}
      onFolderFilterChange={vi.fn()}
      onResetFilters={vi.fn()}
      onScopeChange={vi.fn()}
      onSelectAll={onSelectAll}
    />
  );

  click(findButton(translate('gallery.app.selectAllResults')));

  expect(onSelectAll).toHaveBeenCalledOnce();
  expect(container?.textContent).toContain(`${translate('gallery.app.facetResults')}: 3`);
  expect(findButton(translate('gallery.app.facetResetAll'))).toBeUndefined();
});

it('keeps a selected unavailable facet visible and allows only clearing it', () => {
  const onFacetFilterChange = vi.fn();
  render(
    <GalleryFacetFilters
      activeTags={[]}
      allTags={[]}
      counts={{ all: 1, export: 0, recording: 1, scenario: 0, screenshot: 0 }}
      facetFilters={{
        created: [],
        duration: [],
        format: [],
        resolution: [],
        size: [],
        source: ['shots.example'],
        updated: [],
      }}
      facets={[
        {
          id: 'source',
          searchable: false,
          options: [
            { count: 0, label: 'shots.example', value: 'shots.example' },
            { count: 1, label: 'video.example', value: 'video.example' },
          ],
        },
      ]}
      filteredItemCount={0}
      folderFilter="recording"
      scope="all"
      onActiveTagsChange={vi.fn()}
      onFacetFilterChange={onFacetFilterChange}
      onFolderFilterChange={vi.fn()}
      onResetFilters={vi.fn()}
      onScopeChange={vi.fn()}
      onSelectAll={vi.fn()}
    />
  );

  click(container?.querySelector('summary'));
  const unavailableInput = Array.from(
    container?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? []
  ).find((input) => input.closest('label')?.textContent?.includes('shots.example'));
  expect(unavailableInput?.disabled).toBe(true);
  expect(unavailableInput?.closest('label')?.getAttribute('aria-disabled')).toBe('true');

  click(
    container?.querySelector(
      `[aria-label="${translate('gallery.app.facetClear')} ${translate('gallery.app.facetTitle.source')}"]`
    )
  );
  expect(onFacetFilterChange).toHaveBeenCalledWith('source', []);
});

it('restores expanded facet sections after remounting the sidebar', async () => {
  const facetProps = {
    activeTags: [],
    allTags: [],
    counts: { all: 1, export: 0, recording: 0, scenario: 0, screenshot: 1 },
    facetFilters: {
      created: [],
      duration: [],
      format: [],
      resolution: [],
      size: [],
      source: [],
      updated: [],
    },
    facets: [
      {
        id: 'format' as const,
        searchable: false,
        options: [{ count: 1, label: 'PNG', value: 'png' }],
      },
    ],
    filteredItemCount: 1,
    folderFilter: 'screenshot' as const,
    scope: 'all' as const,
    onActiveTagsChange: vi.fn(),
    onFacetFilterChange: vi.fn(),
    onFolderFilterChange: vi.fn(),
    onResetFilters: vi.fn(),
    onScopeChange: vi.fn(),
    onSelectAll: vi.fn(),
  };

  render(<GalleryFacetFilters {...facetProps} />);
  click(container?.querySelector('summary'));
  await vi.waitFor(() =>
    expect(window.localStorage.getItem('sniptale.gallery.facet-disclosures')).toContain('format')
  );

  act(() => root?.unmount());
  root = createRoot(container!);
  render(<GalleryFacetFilters {...facetProps} />);
  expect(container?.querySelector('details')?.open).toBe(true);
});
