// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMediaItem } from './actions/test-support/index';
import { GalleryGridCanvas, GalleryMediaList } from './main-content/grid-cards';
import { GalleryFacetFilters, GalleryFolderList } from './sidebar/sections';
import { translate } from '../../platform/i18n';

vi.mock('./ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./ui')>()),
  MediaThumb: () => <div data-ui="test.thumb" />,
}));

let container: HTMLDivElement;
let root: Root;

function render(node: ReactNode) {
  act(() => root.render(node));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  window.localStorage.clear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it.each(['compact-grid', 'large-grid'] as const)(
  'distinguishes selection, hover, and keyboard focus in %s including Trash',
  (viewMode) => {
    const selected = createMediaItem({ id: 'selected', filename: 'selected.png' });
    const unselected = createMediaItem({ id: 'unselected', filename: 'unselected.png' });
    const baseProps = {
      filteredItems: [selected, unselected],
      gridMetrics: { columnCount: 2, startRow: 0, totalRows: 1 },
      gridWidth: 800,
      onPreviewOpen: vi.fn(),
      onToggleSelection: vi.fn(),
      selectedIds: new Set(['selected']),
      viewMode,
      visibleItems: [selected, unselected],
    };
    render(<GalleryGridCanvas {...baseProps} />);
    const cards = container.querySelectorAll('article');
    expect(cards[0]?.className).toContain('border-[var(--sniptale-color-border-accent-strong)]');
    expect(cards[1]?.className).toContain('hover:border-[var(--sniptale-color-border-strong)]');
    const selection = cards[1]?.querySelector<HTMLButtonElement>('button[aria-pressed]');
    expect(selection?.getAttribute('aria-pressed')).toBe('false');
    expect(selection?.className).toContain('group-focus-within:opacity-100');
    expect(selection?.className).toContain('focus-visible:ring-[var(--sniptale-color-focus-ring)]');

    render(<GalleryGridCanvas {...baseProps} trashMode />);
    expect(container.querySelector('article')?.className).toContain(
      'border-[var(--sniptale-color-border-accent-strong)]'
    );
  }
);

it.each([false, true])('uses the same bordered material row in Trash=%s', (trashMode) => {
  const item = createMediaItem({ id: 'material', filename: 'material.png' });
  render(
    <GalleryMediaList
      filteredItems={[item]}
      onPreviewOpen={vi.fn()}
      onToggleSelection={vi.fn()}
      selectedIds={new Set(['material'])}
      trashMode={trashMode}
    />
  );
  const row = container.querySelector('[data-ui="gallery.list.row"]');
  expect(row?.className).toContain('border-[var(--sniptale-color-border-accent-strong)]');
  expect(row?.getAttribute('data-selected')).toBe('true');
  expect(row?.className).toContain(
    'data-[selected=true]:border-[var(--sniptale-color-border-accent-strong)]'
  );
  expect(row?.className).toContain('border');
  expect(row?.querySelector('button[aria-pressed]')?.className).toContain(
    'focus-visible:ring-[var(--sniptale-color-focus-ring)]'
  );
});

it.each([false, true])(
  'marks a recording group selected only when all members are selected=%s',
  (allSelected) => {
    const items = ['display', 'webcam'].map((role, order) =>
      createMediaItem({
        id: `recording:${role}`,
        filename: `${role}.webm`,
        kind: 'recording',
        recordingGroupView: {
          groupId: 'capture-1',
          memberCount: 2,
          order,
          projectId: null,
          projectName: null,
          role: role === 'webcam' ? 'webcam' : 'display',
          sourceLabel: role,
        },
      })
    );
    const selectedIds = new Set(allSelected ? items.map((item) => item.id) : [items[0]!.id]);
    render(
      <GalleryGridCanvas
        filteredItems={items}
        gridMetrics={{ columnCount: 1, startRow: 0, totalRows: 1 }}
        gridWidth={400}
        onPreviewOpen={vi.fn()}
        onToggleSelection={vi.fn()}
        selectedIds={selectedIds}
        viewMode="compact-grid"
        visibleItems={[items[0]!]}
      />
    );
    const card = container.querySelector('[data-ui="gallery.recording-group.card"]');
    expect(card?.className.includes('border-[var(--sniptale-color-border-accent-strong)]')).toBe(
      allSelected
    );
    expect(card?.querySelector('button[aria-pressed]')?.getAttribute('aria-pressed')).toBe(
      String(allSelected)
    );

    render(
      <GalleryMediaList
        filteredItems={items}
        onPreviewOpen={vi.fn()}
        onToggleSelection={vi.fn()}
        selectedIds={selectedIds}
      />
    );
    const listGroup = container.querySelector('[role="rowgroup"]');
    expect(
      listGroup?.className.includes('border-[var(--sniptale-color-border-accent-strong)]')
    ).toBe(allSelected);
    expect(
      [...(listGroup?.querySelectorAll('[data-ui="gallery.list.row"]') ?? [])].filter(
        (row) => row.getAttribute('data-selected') === 'true'
      )
    ).toHaveLength(allSelected ? 2 : 1);
  }
);

it('borders active folder and saved-view rows while hover and focus remain distinct', () => {
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
      countsKnown
      activeSavedView={view}
      counts={{ all: 7, audio: 0, export: 1, recording: 0, scenario: 0, screenshot: 4 }}
      folderFilter="screenshot"
      savedViews={[view]}
      savedViewsLoaded
      onFolderFilterChange={vi.fn()}
    />
  );
  const savedViewButton = [...container.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('PNG review')
  );
  expect(savedViewButton?.parentElement?.className).toContain(
    'border-[var(--sniptale-color-border-accent-strong)]'
  );
  expect(savedViewButton?.className).toContain('focus-visible:ring-2');
  const inactiveFolder = [...container.querySelectorAll('button')].find((button) =>
    button.textContent?.includes(translate('gallery.preview.folderExport'))
  );
  expect(inactiveFolder?.className).toContain('hover:border-[var(--sniptale-color-border-soft)]');

  render(
    <GalleryFolderList
      countsKnown
      counts={{ all: 7, audio: 0, export: 0, recording: 0, scenario: 0, screenshot: 4 }}
      folderFilter="screenshot"
      onFolderFilterChange={vi.fn()}
    />
  );
  const activeFolder = [...container.querySelectorAll('button')].find((button) =>
    button.textContent?.includes(translate('gallery.preview.folderScreenshot'))
  );
  expect(activeFolder?.className).toContain('border-[var(--sniptale-color-border-accent-strong)]');
  expect(activeFolder?.className).toContain('focus-visible:ring-2');
});

it('borders checked facet rows and keeps their keyboard ring distinct', () => {
  render(
    <GalleryFacetFilters
      countsKnown
      activeTags={['beta']}
      allTags={['alpha', 'beta']}
      counts={{ all: 2, audio: 0, export: 0, recording: 0, scenario: 0, screenshot: 2 }}
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
          id: 'tags',
          searchable: false,
          options: [
            { count: 1, label: 'alpha', value: 'alpha' },
            { count: 1, label: 'beta', value: 'beta' },
          ],
        },
      ]}
      folderFilter="all"
      filteredItemCount={2}
      scope="all"
      onActiveTagsChange={vi.fn()}
      onFacetFilterChange={vi.fn()}
      onFolderFilterChange={vi.fn()}
      onSelectAll={vi.fn()}
      onResetFilters={vi.fn()}
      onScopeChange={vi.fn()}
    />
  );
  const labels = [...container.querySelectorAll('label')];
  const selected = labels.find((label) => label.textContent?.includes('beta'));
  const unselected = labels.find((label) => label.textContent?.includes('alpha'));
  expect(selected?.className).toContain('border-[var(--sniptale-color-border-accent-strong)]');
  expect(selected?.className).toContain(
    'has-[:focus-visible]:ring-[var(--sniptale-color-focus-ring)]'
  );
  expect(unselected?.className).toContain('hover:border-[var(--sniptale-color-border-soft)]');
  expect(selected?.querySelector('input')?.checked).toBe(true);
});
