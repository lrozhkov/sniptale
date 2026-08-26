// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGalleryState, createMediaItem } from '../../library/actions/test-support/index';
import { createLocalBackupSummary } from './backup-export.test-support';

const { headerPropsMock, mainContentPropsMock, overlaysPropsMock, sidebarPropsMock } = vi.hoisted(
  () => ({
    headerPropsMock: vi.fn(),
    mainContentPropsMock: vi.fn(),
    overlaysPropsMock: vi.fn(),
    sidebarPropsMock: vi.fn(),
  })
);

vi.mock('../../library/main-content', () => ({
  GalleryMainContent: (props: unknown) => {
    mainContentPropsMock(props);
    return <div data-ui="test.main-content" />;
  },
}));

vi.mock('../../library/main-content/header', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../library/main-content/header')>()),
  GalleryHeader: (props: unknown) => {
    headerPropsMock(props);
    return <div data-ui="test.header" />;
  },
}));

vi.mock('./overlays', () => ({
  GalleryOverlays: (props: unknown) => {
    overlaysPropsMock(props);
    return <div data-ui="test.overlays" />;
  },
}));

vi.mock('../../library/sidebar', () => ({
  GallerySidebar: (props: unknown) => {
    sidebarPropsMock(props);
    return <div data-ui="test.sidebar" />;
  },
}));

import { GalleryAppLayout } from './layout';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createLayoutProps() {
  return {
    gridViewportRef: { current: null },
    importInputRef: { current: null },
    importTriggerRef: { current: null },
    mediaImportInputRef: { current: null },
    mediaImportTriggerRef: { current: null },
    onActiveTagsChange: vi.fn(),
    onActiveImportCancel: vi.fn(),
    onActiveImportDismiss: vi.fn(),
    onAddTag: vi.fn(),
    onApplySelectionTag: vi.fn(),
    onBackupExportConfirm: vi.fn(),
    onBackupExportInspect: vi.fn(async () => createLocalBackupSummary()),
    onBannerDismiss: vi.fn(),
    onClearSelection: vi.fn(),
    onConfirmDialogClose: vi.fn(),
    onDeleteMany: vi.fn(),
    onExportBackup: vi.fn(),
    onFacetFilterChange: vi.fn(),
    onFilenameChange: vi.fn(),
    onFolderFilterChange: vi.fn(),
    onImport: vi.fn(),
    onImportBackupClick: vi.fn(),
    onImportFileChange: vi.fn(),
    onMediaImportFileChange: vi.fn(),
    onImportMediaClick: vi.fn(),
    onPendingExportClose: vi.fn(),
    onPendingImportClose: vi.fn(),
    onPendingMediaImportClose: vi.fn(),
    onMediaImportConfirm: vi.fn(),
    onPreviewClose: vi.fn(),
    onPreviewCopy: vi.fn(),
    onPreviewDelete: vi.fn(),
    onPreviewDownload: vi.fn(),
    onPreviewDownloadOriginal: vi.fn(),
    onPreviewEdit: vi.fn(),
    onPreviewInspectorToggle: vi.fn(),
    onPreviewOpen: vi.fn(),
    onPreviewNavigate: vi.fn(),
    onPreviewOpenSnapshotScreenshot: vi.fn(),
    onPreviewResetChanges: vi.fn(),
    onPreviewRestoreOriginal: vi.fn(),
    onPreviewSaveCopy: vi.fn(),
    onRemoveTag: vi.fn(),
    onResetFilters: vi.fn(),
    onSelectAllFiltered: vi.fn(),
    onSearchChange: vi.fn(),
    onScopeChange: vi.fn(),
    onSelectionTagDraftChange: vi.fn(),
    onSelectionBackup: vi.fn(),
    onSelectionZip: vi.fn(),
    onSortModeChange: vi.fn(),
    onViewModeChange: vi.fn(),
    onTagDraftChange: vi.fn(),
    onToggleSelection: vi.fn(),
    state: createGalleryState(),
    viewMode: 'compact-grid' as const,
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

function renderLayoutAndTriggerImport(props: ReturnType<typeof createLayoutProps>) {
  act(() => {
    root?.render(<GalleryAppLayout {...props} />);
  });

  const input = container?.querySelector('input');
  if (!input) {
    throw new Error('Expected import input');
  }

  act(() => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

it('wires sidebar/main/overlay sections and normalizes storage info branches', () => {
  const withStorage = createLayoutProps();
  withStorage.state = createGalleryState({
    allTags: ['alpha'],
    counts: { all: 4, export: 1, recording: 1, scenario: 1, screenshot: 2 },
    filteredItems: [createMediaItem({ id: 'asset-1', tags: ['alpha'] })],
    facets: [
      {
        id: 'format',
        searchable: false,
        options: [{ count: 1, label: 'PNG', value: 'png' }],
      },
    ],
    storageInfo: {
      usage: 10,
      quota: 20,
      remaining: 10,
      usageRatio: 0.5,
      pressure: 'healthy',
      isPersistent: null,
    },
  });

  renderLayoutAndTriggerImport(withStorage);

  expect(withStorage.onImportFileChange).toHaveBeenCalledWith(null);
  expectLayoutSections(withStorage);

  const withoutStorage = createLayoutProps();
  act(() => {
    root?.render(<GalleryAppLayout {...withoutStorage} />);
  });

  expect(headerPropsMock).toHaveBeenLastCalledWith(expect.objectContaining({ storageInfo: null }));
});

it('passes all selected local media files to the dedicated import action', () => {
  const props = createLayoutProps();
  act(() => root?.render(<GalleryAppLayout {...props} />));
  const mediaInput = container?.querySelectorAll<HTMLInputElement>('input[type="file"]')[1];
  const files = [
    new File(['image'], 'photo.png', { type: 'image/png' }),
    new File(['video'], 'clip.mp4', { type: 'video/mp4' }),
  ];
  Object.defineProperty(mediaInput, 'files', { configurable: true, value: files });

  act(() => mediaInput?.dispatchEvent(new Event('change', { bubbles: true })));

  expect(props.onMediaImportFileChange).toHaveBeenCalledWith(files);
});

function expectLayoutSections(withStorage: ReturnType<typeof createLayoutProps>): void {
  const pageRoot = container?.querySelector<HTMLElement>('[data-ui="gallery.page.root"]');
  expect(pageRoot?.className).toContain('h-full');
  expect(pageRoot?.className).toContain('min-h-0');
  expect(pageRoot?.className).toContain('overflow-hidden');
  expect(pageRoot?.className).not.toContain('fixed inset-0');
  expect(pageRoot?.className).not.toContain('h-screen');
  expect(sidebarPropsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      counts: expect.objectContaining({ scenario: 1 }),
      facets: [expect.objectContaining({ id: 'format' })],
    })
  );
  expect(headerPropsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      folderFilter: withStorage.state.filters.folderFilter,
      search: withStorage.state.filters.search,
      sortMode: withStorage.state.filters.sortMode,
      storageInfo: expect.objectContaining({
        usage: 10,
        quota: 20,
        usageRatio: 0.5,
      }),
      viewMode: withStorage.viewMode,
    })
  );
  expect(mainContentPropsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      allTags: ['alpha'],
      filteredItems: withStorage.state.derived.filteredItems,
    })
  );
  expect(overlaysPropsMock).toHaveBeenCalled();
}

it('forwards fully populated storage info when quota, ratio, and persistence are defined', () => {
  const props = createLayoutProps();
  props.state = createGalleryState({
    storageInfo: {
      usage: 10,
      quota: 40,
      remaining: 30,
      usageRatio: 0.25,
      pressure: 'healthy',
      isPersistent: true,
    },
  });

  act(() => {
    root?.render(<GalleryAppLayout {...props} />);
  });

  expect(headerPropsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      storageInfo: expect.objectContaining({
        usage: 10,
        quota: 40,
        usageRatio: 0.25,
        isPersistent: true,
      }),
    })
  );
});

it('renders active import progress as a floating status outside the sidebar', () => {
  const props = createLayoutProps();
  props.state = createGalleryState({
    activeImport: {
      file: new File(['backup'], 'library-backup.zip'),
      id: 'active-import',
      progress: {
        bytesRead: 3,
        bytesWritten: 3,
        currentFilename: 'Screenshots/example.png',
        rootsComplete: 1,
      },
      status: 'running',
      strategy: 'replace',
      totalBytes: 6,
      totalRoots: 2,
    },
  });

  act(() => {
    root?.render(<GalleryAppLayout {...props} />);
  });

  const progress = container?.querySelector('[data-ui="gallery.import-progress"]');
  expect(progress?.className).toContain('fixed');
  expect(progress?.textContent).toContain('library-backup.zip');
  expect(sidebarPropsMock).toHaveBeenCalledWith(
    expect.not.objectContaining({ activeImport: expect.anything() })
  );
});

it('forwards facet, scope, grouped-recording, selection, and delete callbacks', () => {
  const props = createLayoutProps();
  const onRecordingGroupOpen = vi.fn();

  act(() => {
    root?.render(<GalleryAppLayout {...props} onRecordingGroupOpen={onRecordingGroupOpen} />);
  });

  const sidebarProps = sidebarPropsMock.mock.lastCall?.[0] as {
    onFacetFilterChange: (id: 'format', values: string[]) => void;
    onResetFilters: () => void;
  };
  const mainProps = mainContentPropsMock.mock.lastCall?.[0] as {
    onApplySelectionTag: (tag: string) => void;
    onRecordingGroupOpen: typeof onRecordingGroupOpen;
    onScopeChange: (scope: 'temporary') => void;
  };
  const headerProps = headerPropsMock.mock.lastCall?.[0] as { onDeleteAll: () => void };

  act(() => {
    sidebarProps.onFacetFilterChange('format', ['png']);
    sidebarProps.onResetFilters();
    mainProps.onApplySelectionTag('alpha');
    mainProps.onRecordingGroupOpen(createMediaItem());
    mainProps.onScopeChange('temporary');
    headerProps.onDeleteAll();
  });

  expect(props.onFacetFilterChange).toHaveBeenCalledWith('format', ['png']);
  expect(props.onResetFilters).toHaveBeenCalledTimes(1);
  expect(props.onApplySelectionTag).toHaveBeenCalledWith('alpha');
  expect(onRecordingGroupOpen).toHaveBeenCalledTimes(1);
  expect(props.onScopeChange).toHaveBeenCalledWith('temporary');
  expect(props.onDeleteMany).toHaveBeenCalledWith(props.state.derived.allItems);

  const {
    onFacetFilterChange: omittedFacetFilterChange,
    onScopeChange: omittedScopeChange,
    ...fallbackProps
  } = props;
  void omittedFacetFilterChange;
  void omittedScopeChange;
  act(() => {
    root?.render(<GalleryAppLayout {...fallbackProps} />);
  });
  const fallbackSidebarProps = sidebarPropsMock.mock.lastCall?.[0] as {
    onFacetFilterChange: (id: 'format', values: string[]) => void;
    onScopeChange: (scope: 'all') => void;
  };
  const fallbackMainProps = mainContentPropsMock.mock.lastCall?.[0] as {
    onScopeChange: (scope: 'all') => void;
  };
  expect(() => {
    fallbackSidebarProps.onFacetFilterChange('format', []);
    fallbackSidebarProps.onScopeChange('all');
    fallbackMainProps.onScopeChange('all');
  }).not.toThrow();
});
