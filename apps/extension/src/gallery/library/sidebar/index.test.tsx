// @vitest-environment jsdom
import { formatNumber, getCurrentLocale, translate } from '../../../platform/i18n';
import { formatBytes } from '../../../platform/i18n/format-bytes';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS } from '@sniptale/ui/inspector-shell';
import type { GallerySidebarProps } from './types';

const sectionMocks = vi.hoisted(() => ({
  facetFilters: vi.fn(),
  folderList: vi.fn(),
}));

vi.mock('./trash-retention-state', () => ({
  useTrashRetentionPolicy: () => ({
    status: 'ready',
    policy: { trashCleanupEnabled: false, trashRetentionDays: 30 },
    saving: false,
    feedback: null,
    onChange: vi.fn(),
    onRetry: vi.fn(),
  }),
}));

vi.mock('./sections', () => ({
  GalleryFolderList: (props: unknown) => {
    sectionMocks.folderList(props);
    return <div data-ui="test.folder-list" />;
  },
  GalleryFacetFilters: (props: unknown) => {
    sectionMocks.facetFilters(props);
    return <div data-ui="test.facet-filters" />;
  },
}));

import { GallerySidebar } from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProps(): GallerySidebarProps {
  return {
    onClearSelection: vi.fn(),
    activeTags: ['alpha'],
    allTags: ['alpha', 'beta'],
    countsKnown: true,
    counts: { all: 2, audio: 0, export: 0, recording: 0, scenario: 1, screenshot: 2 },
    facetFilters: {
      created: [],
      duration: [],
      format: [],
      resolution: [],
      size: [],
      source: [],
      updated: [],
    },
    facets: [],
    filteredItemCount: 2,
    trashSummary: { count: 3, size: { status: 'ready', bytes: 1536 } },
    folderFilter: 'all',
    scope: 'all',
    onActiveTagsChange: vi.fn(),
    onFacetFilterChange: vi.fn(),
    onFolderFilterChange: vi.fn(),
    onResetFilters: vi.fn(),
    onSelectAll: vi.fn(),
    onScopeChange: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
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

it('composes folder and tag sections inside the shared shell', () => {
  const props = createProps();

  act(() => {
    root?.render(<GallerySidebar {...props} />);
  });

  expect(container?.querySelector('aside')?.className).toContain(
    INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS
  );
  expect(container?.querySelector('[data-ui="gallery.sidebar.panel"]')?.className).toContain(
    'rounded-[var(--sniptale-radius-lg)]'
  );
  expect(container?.querySelector('[data-ui="gallery.sidebar.shell"]')?.className).toContain(
    'overflow-hidden'
  );
  const scrollRegion = container?.querySelector<HTMLElement>('[data-ui="gallery.sidebar.scroll"]');
  expect(scrollRegion?.className).toContain('overflow-y-auto');
  expect(scrollRegion?.className).toContain('overscroll-contain');
  expect(scrollRegion?.className).not.toContain('[overflow-anchor:none]');
  expect(
    scrollRegion?.contains(container?.querySelector('[data-ui="test.facet-filters"]') ?? null)
  ).toBe(true);
  expect(
    scrollRegion?.contains(container?.querySelector('[data-ui="gallery.sidebar.footer"]') ?? null)
  ).toBe(false);
  scrollRegion!.scrollTop = 240;
  act(() => root?.render(<GallerySidebar {...props} filteredItemCount={1} />));
  expect(container?.querySelector('[data-ui="gallery.sidebar.scroll"]')).toBe(scrollRegion);
  expect(scrollRegion?.scrollTop).toBe(240);
  const trashButton = container?.querySelector<HTMLElement>(
    '[data-ui="gallery.sidebar.footer"] button'
  );
  expect(trashButton?.classList.contains('w-full')).toBe(true);
  expect(trashButton?.textContent).toContain('3');
  expect(
    container?.querySelector('[data-ui="gallery.trash.footerSummary"]')?.textContent
  ).toContain(formatBytes(1536));
  expect(trashButton?.className).not.toContain('!flex-col');
  expect(trashButton?.textContent).not.toContain(translate('gallery.app.trashSummaryCount'));
  expect(sectionMocks.folderList).toHaveBeenCalledWith(expect.objectContaining(props));
  expect(sectionMocks.facetFilters).toHaveBeenCalledWith(expect.objectContaining(props));
});

it('offers trash navigation and replaces library filters with recoverable actions', () => {
  const props = {
    ...createProps(),
    onTrashModeChange: vi.fn(),
    onRestoreTrash: vi.fn(),
    onDeleteTrash: vi.fn(),
    onEmptyTrash: vi.fn(),
    selectedCount: 1,
  };
  const button = (key: Parameters<typeof translate>[0]) =>
    Array.from(container!.querySelectorAll('button')).find((element) =>
      element.textContent?.includes(translate(key))
    )!;
  act(() => root?.render(<GallerySidebar {...props} />));
  expect(button('gallery.app.trashTitle').querySelector('svg.lucide-trash2')).not.toBeNull();
  act(() => button('gallery.app.trashTitle').click());
  expect(props.onTrashModeChange).toHaveBeenCalledWith(true);
  act(() => root?.render(<GallerySidebar {...props} trashMode />));
  const returnButton = button('gallery.app.returnToLibrary');
  expect(returnButton.className).toContain('rounded-[var(--sniptale-radius-sm)]');
  expect(returnButton.className).toContain('hover:border-');
  expect(returnButton.className).toContain('focus-visible:ring-2');
  expect(container?.querySelector('[data-ui="test.folder-list"]')).toBeNull();
  expect(container?.querySelector('[data-ui="test.facet-filters"]')).toBeNull();
  expect(container?.querySelector('[data-ui="gallery.trash.summary"]')?.textContent).toContain(
    formatBytes(1536)
  );
  expect(container?.querySelector('[data-ui="gallery.trash.summary"]')?.textContent).toContain(
    translate('gallery.app.trashTotalSize')
  );
  const scrollContent = container!.querySelector('[data-ui="gallery.sidebar.scroll"]')!;
  const summary = scrollContent.querySelector('[data-ui="gallery.trash.summary"]')!;
  const retention = scrollContent.querySelector('[data-ui="gallery.trash.retention"]')!;
  expect(
    summary.compareDocumentPosition(retention) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
  expect(
    button('gallery.app.permanentDelete').compareDocumentPosition(retention) &
      Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
  act(() => button('gallery.app.restoreTrash').click());
  act(() => button('gallery.app.permanentDelete').click());
  act(() => button('gallery.app.emptyTrash').click());
  act(() => button('gallery.app.returnToLibrary').click());
  expect(props.onRestoreTrash).toHaveBeenCalledOnce();
  expect(props.onDeleteTrash).toHaveBeenCalledOnce();
  expect(props.onEmptyTrash).toHaveBeenCalledOnce();
  expect(props.onTrashModeChange).toHaveBeenLastCalledWith(false);
  act(() => root?.render(<GallerySidebar {...props} trashMode filteredItemCount={0} />));
  expect(button('gallery.app.emptyTrash').disabled).toBe(false);
  expect(button('gallery.app.trashSelectAll').disabled).toBe(true);
  act(() => root?.render(<GallerySidebar {...props} trashMode busy />));
  for (const key of [
    'gallery.app.trashSelectAll',
    'gallery.app.restoreTrash',
    'gallery.app.permanentDelete',
    'gallery.app.emptyTrash',
    'gallery.app.returnToLibrary',
  ] as const) {
    expect(button(key).disabled).toBe(true);
  }
});

it('shows zero, loading and unavailable Trash totals without a misleading size', () => {
  const props = createProps();
  const footerButton = () =>
    container?.querySelector<HTMLButtonElement>('[data-ui="gallery.sidebar.footer"] button');

  act(() =>
    root?.render(
      <GallerySidebar {...props} trashSummary={{ count: 0, size: { status: 'ready', bytes: 0 } }} />
    )
  );
  expect(footerButton()?.textContent).toContain('0');
  expect(
    container?.querySelector('[data-ui="gallery.trash.footerSummary"]')?.textContent
  ).toContain(formatBytes(0));

  act(() =>
    root?.render(
      <GallerySidebar {...props} trashSummary={{ count: 2, size: { status: 'loading' } }} />
    )
  );
  expect(
    container?.querySelector('[data-ui="gallery.trash.footerSummary"]')?.textContent
  ).toContain(translate('gallery.app.trashSizeLoading'));
  expect(footerButton()?.textContent).not.toContain(formatBytes(0));

  act(() =>
    root?.render(
      <GallerySidebar {...props} trashSummary={{ count: 2, size: { status: 'unavailable' } }} />
    )
  );
  expect(
    container?.querySelector('[data-ui="gallery.trash.footerSummary"]')?.textContent
  ).toContain(translate('gallery.app.trashSizeUnavailable'));
  act(() => root?.render(<GallerySidebar {...props} countsKnown={false} />));
  expect(footerButton()?.textContent).not.toContain('0');
});

it.each([1, 2])(
  'clears partial or full Trash selection (%s) and updates actions',
  (selectedCount) => {
    const props = { ...createProps(), trashMode: true, selectedCount };
    const clear = () =>
      container!.querySelector<HTMLButtonElement>(
        `button[aria-label="${translate('gallery.app.trashDeselectAll')}"]`
      );
    act(() => root?.render(<GallerySidebar {...props} />));
    expect(clear()).not.toBeNull();
    act(() => clear()!.click());
    expect(props.onClearSelection).toHaveBeenCalledOnce();
    act(() => root?.render(<GallerySidebar {...props} busy />));
    expect(clear()!.disabled).toBe(true);
    act(() => root?.render(<GallerySidebar {...props} selectedCount={0} />));
    expect(clear()).toBeNull();
    const restore = Array.from(container!.querySelectorAll('button')).find((button) =>
      button.textContent?.includes(translate('gallery.app.restoreTrash'))
    );
    expect(restore!.disabled).toBe(true);
  }
);

it.each([
  { status: 'ready' as const, bytes: 3670016 },
  { status: 'loading' as const },
  { status: 'unavailable' as const },
])('uses the same full-Trash size in both surfaces for $status', (size) => {
  const props = { ...createProps(), trashSummary: { count: 3, size } };
  act(() => root?.render(<GallerySidebar {...props} />));
  const footerSize = container!.querySelector<HTMLElement>(
    '[data-ui="gallery.trash.footerSummary"] span[title]'
  )!;
  const sizeText = footerSize.textContent!;
  expect(footerSize.title).toBe(translate('gallery.app.trashSizeExplanation'));
  act(() => root?.render(<GallerySidebar {...props} trashMode />));
  expect(container!.querySelector('[data-ui="gallery.trash.summary"]')!.textContent).toContain(
    sizeText
  );
});

it('shows count loading and makes size semantics reachable from keyboard controls', () => {
  const props = createProps();
  act(() => root?.render(<GallerySidebar {...props} countsKnown={false} />));
  const footer = container!.querySelector<HTMLButtonElement>(
    '[data-ui="gallery.sidebar.footer"] button'
  )!;
  const loading = Array.from(footer.querySelectorAll('span')).find(
    (span) => span.textContent === translate('gallery.app.trashCountLoading')
  )!;
  expect(loading.className).not.toContain('sr-only');
  const description = document.getElementById(footer.getAttribute('aria-describedby')!)!;
  expect(description.textContent).toContain(translate('gallery.app.trashSizeExplanation'));
  act(() => root?.render(<GallerySidebar {...props} trashMode />));
  const disclosure = container!.querySelector<HTMLDetailsElement>(
    '[data-ui="gallery.trash.summary"] details'
  )!;
  const summary = disclosure.querySelector<HTMLElement>('summary')!;
  summary.focus();
  expect(document.activeElement).toBe(summary);
  act(() => summary.click());
  expect(disclosure.open).toBe(true);
  expect(disclosure.querySelector('p')!.textContent).toBe(
    translate('gallery.app.trashSizeExplanation')
  );
});

it.each([0, 6, 42, 1234567])(
  'renders a bounded badge and accessible full Trash count (%s)',
  (count) => {
    act(() =>
      root?.render(
        <GallerySidebar
          {...createProps()}
          trashSummary={{ count, size: { status: 'ready', bytes: 0 } }}
        />
      )
    );
    const footer = container!.querySelector<HTMLButtonElement>(
      '[data-ui="gallery.sidebar.footer"] button'
    )!;
    const badge = footer.querySelector<HTMLElement>('[data-ui="gallery.trash.footerCount"]')!;
    const full = formatNumber(count, undefined, getCurrentLocale());
    expect(badge.title).toBe(full);
    expect(badge.className).toContain('shrink-0');
    expect(footer.getAttribute('aria-label')).toBe(
      `${translate('gallery.app.trashTitle')}: ${full}`
    );
    expect(footer.className).not.toContain('flex-col');
    if (count < 1000) expect(badge.textContent).toBe(full);
    else expect(badge.textContent!.length).toBeLessThan(full.length);
  }
);

it('does not show incomplete facets before the first library snapshot', () => {
  const props = createProps();
  act(() => root?.render(<GallerySidebar {...props} countsKnown={false} />));
  expect(container?.querySelector('[data-ui="test.facet-filters"]')).toBeNull();
  act(() => root?.render(<GallerySidebar {...props} countsKnown />));
  expect(container?.querySelector('[data-ui="test.facet-filters"]')).not.toBeNull();
});

it('groups selection recovery and deletion before cleanup settings and whole-trash actions', () => {
  act(() => root?.render(<GallerySidebar {...createProps()} trashMode selectedCount={1} />));
  const selection = container!.querySelector('[data-ui="gallery.trash.selection"]')!;
  expect(selection).not.toBeNull();
  expect(selection.textContent).toContain(translate('gallery.app.restoreTrash'));
  expect(selection.textContent).toContain(translate('gallery.app.permanentDelete'));
  expect(selection.textContent).not.toContain(translate('gallery.app.emptyTrash'));
  const retention = container!.querySelector('[data-ui="gallery.trash.retention"]')!;
  expect(
    selection.compareDocumentPosition(retention) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
  expect(retention.querySelector('h3')?.textContent).toBe(
    translate('gallery.app.trashRetentionTitle')
  );
  expect(container!.querySelector('h2')?.textContent).toBe(translate('gallery.app.trashTitle'));
});

it('collapses presentation without mutating folder, filters or saved-view context', () => {
  const props = {
    ...createProps(),
    folderFilter: 'screenshot' as const,
    scope: 'temporary' as const,
  };
  act(() => root?.render(<GallerySidebar {...props} />));
  const toggle = container!.querySelector<HTMLButtonElement>('[data-ui="gallery.sidebar.toggle"]')!;
  expect(toggle).not.toBeNull();
  expect(toggle.closest('[data-ui="gallery.sidebar.footer"]')).not.toBeNull();
  act(() => toggle.click());
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(container!.querySelector('[data-ui="gallery.sidebar.shell"]')?.className).toContain(
    'w-14'
  );
  expect(
    container!.querySelector<HTMLElement>('[data-ui="test.facet-filters"]')?.parentElement?.hidden
  ).toBe(true);
  expect(sectionMocks.folderList).toHaveBeenLastCalledWith(
    expect.objectContaining({ compact: true, folderFilter: 'screenshot' })
  );
  act(() => toggle.click());
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(
    container!.querySelector<HTMLElement>('[data-ui="test.facet-filters"]')?.parentElement?.hidden
  ).toBe(false);
  expect(sectionMocks.facetFilters).toHaveBeenLastCalledWith(
    expect.objectContaining({ scope: 'temporary', activeTags: ['alpha'] })
  );
  expect(props.onFolderFilterChange).not.toHaveBeenCalled();
  expect(props.onScopeChange).not.toHaveBeenCalled();
  expect(props.onResetFilters).not.toHaveBeenCalled();
  act(() => toggle.click());
  act(() => root?.render(<GallerySidebar {...props} trashMode />));
  expect(container!.querySelector('[data-ui="gallery.sidebar.toggle"]')).toBeNull();
  expect(container!.querySelector('[data-ui="gallery.sidebar.shell"]')?.className).not.toContain(
    'w-14'
  );
  act(() => root?.render(<GallerySidebar {...props} />));
  expect(
    container!.querySelector('[data-ui="gallery.sidebar.toggle"]')?.getAttribute('aria-expanded')
  ).toBe('false');
});
