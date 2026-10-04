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
  compact?: boolean;
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
        compact={props.compact ?? false}
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
  expect(folderButton(translate('gallery.preview.folderAll'))?.className).toContain(
    'border-transparent'
  );
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

it('keeps all available compact folders named, selectable and current without extra rows', () => {
  const onFolderFilterChange = vi.fn();
  act(() =>
    root?.render(
      <GalleryFolderList
        compact
        counts={{
          all: 8,
          screenshot: 1,
          recording: 1,
          audio: 1,
          scenario: 1,
          export: 1,
          'video-project': 1,
          'web-snapshot': 1,
        }}
        countsKnown
        folderFilter="screenshot"
        savedViewsLoaded
        onFolderFilterChange={onFolderFilterChange}
      />
    )
  );
  const buttons = [
    ...container!.querySelectorAll<HTMLButtonElement>('[data-gallery-folder] > button'),
  ];
  expect(buttons).toHaveLength(8);
  for (const button of buttons) {
    expect(button.getAttribute('aria-label')).toBeTruthy();
    expect(button.title).toBe(button.getAttribute('aria-label'));
    expect(button.querySelector('span.truncate')).toBeNull();
    expect(button.querySelector('svg')).not.toBeNull();
  }
  const screenshot = container!.querySelector<HTMLButtonElement>(
    '[data-gallery-folder="screenshot"] > button'
  )!;
  expect(screenshot.getAttribute('aria-pressed')).toBe('true');
  act(() => screenshot.click());
  expect(onFolderFilterChange).toHaveBeenCalledWith('screenshot');
  expect(container!.textContent).not.toContain(translate('gallery.preview.projectsHeading'));
});

it('keeps an empty saved-view parent current when compact and restores its row on expansion', () => {
  const onFolderFilterChange = vi.fn();
  const view = {
    id: 'empty-view',
    name: 'Empty saved view',
    createdAt: 1,
    updatedAt: 1,
    folderFilter: 'screenshot' as const,
    filters: {
      activeTags: ['keep'],
      scope: 'temporary' as const,
      facetFilters: {
        created: [],
        updated: [],
        duration: [],
        format: [],
        resolution: [],
        size: [],
        source: [],
      },
    },
  };
  const props = {
    counts: EMPTY_COUNTS,
    countsKnown: true,
    folderFilter: 'screenshot' as const,
    activeSavedView: view,
    savedViews: [view],
    savedViewsLoaded: true,
    onFolderFilterChange,
  };
  act(() => root?.render(<GalleryFolderList {...props} compact />));
  const current = container!.querySelector('[data-gallery-folder="screenshot"] > button');
  expect(current?.getAttribute('aria-pressed')).toBe('true');
  expect(container!.textContent).not.toContain(view.name);
  act(() => root?.render(<GalleryFolderList {...props} />));
  expect(container!.textContent).toContain(view.name);
  expect(onFolderFilterChange).not.toHaveBeenCalled();
});

it('restores compact keyboard focus to All when a category disappears', () => {
  renderList({ compact: true, counts: { ...EMPTY_COUNTS, all: 1, screenshot: 1 } });
  const screenshot = container!.querySelector<HTMLButtonElement>(
    '[data-gallery-folder="screenshot"] > button'
  )!;
  act(() => screenshot.focus());
  expect(document.activeElement).toBe(screenshot);
  renderList({ compact: true, counts: EMPTY_COUNTS });
  expect(document.activeElement).toBe(
    container!.querySelector('[data-gallery-folder="all"] > button')
  );
  expect(container!.querySelector('[data-gallery-folder="screenshot"]')).toBeNull();
});
