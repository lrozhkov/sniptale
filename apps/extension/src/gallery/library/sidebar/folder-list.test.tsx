// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import type { GalleryFolderCounts } from '../types';
import { GalleryFolderList } from './folder-list';

const EMPTY_COUNTS: GalleryFolderCounts = {
  all: 0,
  audio: 0,
  export: 0,
  recording: 0,
  scenario: 0,
  screenshot: 0,
  'video-project': 0,
  'web-snapshot': 0,
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderList(props: {
  counts?: GalleryFolderCounts;
  countsKnown?: boolean;
  countsLoading?: boolean;
  folderFilter?: 'all' | 'screenshot';
  savedViews?: Parameters<typeof GalleryFolderList>[0]['savedViews'];
  savedViewsLoaded?: boolean;
  onFolderFilterChange?: Parameters<typeof GalleryFolderList>[0]['onFolderFilterChange'];
}) {
  act(() =>
    root?.render(
      <GalleryFolderList
        counts={props.counts ?? EMPTY_COUNTS}
        countsKnown={props.countsKnown ?? true}
        countsLoading={props.countsLoading ?? false}
        folderFilter={props.folderFilter ?? 'all'}
        {...(props.savedViews ? { savedViews: props.savedViews } : {})}
        {...(props.savedViewsLoaded !== undefined
          ? { savedViewsLoaded: props.savedViewsLoaded }
          : {})}
        onFolderFilterChange={props.onFolderFilterChange ?? vi.fn()}
      />
    )
  );
}

function folderButton(label: string): HTMLButtonElement | undefined {
  return Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find((button) =>
    button.textContent?.includes(label)
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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

it('shows only All for a confirmed empty library and places headings before later visible siblings', () => {
  renderList({});
  expect(folderButton(translate('gallery.preview.folderAll'))).toBeDefined();
  expect(container?.querySelectorAll('[data-gallery-folder]')).toHaveLength(1);
  expect(container?.textContent).not.toContain(translate('gallery.preview.projectsHeading'));
  expect(container?.textContent).not.toContain(translate('gallery.preview.materialsHeading'));

  renderList({ counts: { ...EMPTY_COUNTS, all: 2, scenario: 1, recording: 1 } });
  expect(folderButton(translate('gallery.preview.folderScenario'))).toBeDefined();
  expect(folderButton(translate('gallery.preview.folderRecording'))).toBeDefined();
  expect(folderButton(translate('gallery.preview.folderVideoProject'))).toBeUndefined();
  expect(folderButton(translate('gallery.preview.folderScreenshot'))).toBeUndefined();
  expect(container?.textContent).toContain(translate('gallery.preview.projectsHeading'));
  expect(container?.textContent).toContain(translate('gallery.preview.materialsHeading'));
});

it('keeps the same unknown-count skeleton through initial error and retry', () => {
  renderList({ countsKnown: false, countsLoading: true });
  const placeholder = container?.querySelector('[data-ui="gallery.sidebar.folderLoading"]');
  expect(placeholder).not.toBeNull();
  expect(container?.querySelector('[aria-busy="true"]')).not.toBeNull();
  expect(container?.querySelectorAll('[data-gallery-folder]')).toHaveLength(1);
  expect(folderButton(translate('gallery.preview.folderAll'))?.textContent).not.toContain('0');

  renderList({
    countsKnown: false,
    countsLoading: false,
    counts: { ...EMPTY_COUNTS, all: 4, screenshot: 4 },
  });
  expect(container?.querySelector('[data-ui="gallery.sidebar.folderLoading"]')).toBe(placeholder);
  expect(container?.querySelector('[aria-busy="false"]')).not.toBeNull();
  expect(folderButton(translate('gallery.preview.folderScreenshot'))).toBeUndefined();
});

it('returns focus to All when an inactive focused category disappears', () => {
  renderList({ counts: { ...EMPTY_COUNTS, all: 1, screenshot: 1 } });
  act(() => folderButton(translate('gallery.preview.folderScreenshot'))?.focus());
  expect(document.activeElement).toBe(folderButton(translate('gallery.preview.folderScreenshot')));

  renderList({ counts: EMPTY_COUNTS });
  expect(document.activeElement).toBe(folderButton(translate('gallery.preview.folderAll')));
  expect(folderButton(translate('gallery.preview.folderScreenshot'))).toBeUndefined();
});

it('falls back from an emptied active category and recovers focus from saved-view controls', () => {
  const onSavedViewSelect = vi.fn();
  const onDeleteSavedView = vi.fn();
  const view = {
    createdAt: 1,
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
    id: 'view-1',
    name: 'Saved capture view',
    updatedAt: 1,
  };
  function Probe({ counts }: { counts: GalleryFolderCounts }) {
    const [folderFilter, setFolderFilter] = useState<'all' | 'screenshot'>('screenshot');
    return (
      <GalleryFolderList
        counts={counts}
        countsKnown
        folderFilter={folderFilter}
        savedViews={[view]}
        savedViewsLoaded
        onSavedViewSelect={onSavedViewSelect}
        onDeleteSavedView={onDeleteSavedView}
        onFolderFilterChange={(value) => setFolderFilter(value as 'all' | 'screenshot')}
      />
    );
  }

  act(() => root?.render(<Probe counts={{ ...EMPTY_COUNTS, all: 1, screenshot: 1 }} />));
  const savedViewControl = container?.querySelector<HTMLButtonElement>(
    `[aria-label="${translate('gallery.app.savedViewDelete')} Saved capture view"]`
  );
  act(() => savedViewControl?.focus());
  expect(document.activeElement).toBe(savedViewControl);

  act(() => root?.render(<Probe counts={EMPTY_COUNTS} />));
  expect(document.activeElement).toBe(folderButton(translate('gallery.preview.folderAll')));
  expect(folderButton(translate('gallery.preview.folderScreenshot'))).toBeUndefined();
  expect(container?.textContent).toContain('Saved capture view');
  expect(container?.textContent).toContain(translate('gallery.app.savedViewsHeading'));
  expect(container?.querySelectorAll('[data-gallery-folder]')).toHaveLength(1);
  act(() =>
    Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      .find((button) => button.textContent === 'Saved capture view')
      ?.click()
  );
  expect(onSavedViewSelect).toHaveBeenCalledWith('view-1');
  act(() =>
    container
      ?.querySelector<HTMLButtonElement>(
        `[aria-label="${translate('gallery.app.savedViewDelete')} Saved capture view"]`
      )
      ?.click()
  );
  expect(onDeleteSavedView).toHaveBeenCalledWith(view);

  act(() => root?.render(<Probe counts={{ ...EMPTY_COUNTS, all: 1, screenshot: 1 }} />));
  expect(container?.textContent).toContain('Saved capture view');
  expect(container?.querySelector('[data-ui="gallery.sidebar.hiddenSavedViews"]')).toBeNull();
});
