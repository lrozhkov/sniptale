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
    onActiveTagsChange: vi.fn(),
    onAddTag: vi.fn(),
    onApplySelectionTag: vi.fn(),
    onBackupExportConfirm: vi.fn(),
    onBackupExportInspect: vi.fn(async () => createLocalBackupSummary()),
    onBannerDismiss: vi.fn(),
    onClearSelection: vi.fn(),
    onConfirmDialogClose: vi.fn(),
    onDeleteMany: vi.fn(),
    onExportBackup: vi.fn(),
    onFilenameChange: vi.fn(),
    onFolderFilterChange: vi.fn(),
    onImport: vi.fn(),
    onImportBackupClick: vi.fn(),
    onImportFileChange: vi.fn(),
    onPendingExportClose: vi.fn(),
    onPendingImportClose: vi.fn(),
    onPreviewClose: vi.fn(),
    onPreviewCopy: vi.fn(),
    onPreviewDelete: vi.fn(),
    onPreviewDownload: vi.fn(),
    onPreviewEdit: vi.fn(),
    onPreviewInspectorToggle: vi.fn(),
    onPreviewOpen: vi.fn(),
    onPreviewOpenSnapshotScreenshot: vi.fn(),
    onPreviewResetChanges: vi.fn(),
    onRefresh: vi.fn(),
    onRemoveTag: vi.fn(),
    onSearchChange: vi.fn(),
    onSelectionTagDraftChange: vi.fn(),
    onSelectionZip: vi.fn(),
    onSortModeChange: vi.fn(),
    onViewModeChange: vi.fn(),
    onStorageCleanup: vi.fn(),
    onStorageManagerClose: vi.fn(),
    onStorageManagerOpen: vi.fn(),
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

  expect(sidebarPropsMock).toHaveBeenLastCalledWith(expect.objectContaining({ storageInfo: null }));
});

function expectLayoutSections(withStorage: ReturnType<typeof createLayoutProps>): void {
  expect(sidebarPropsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      counts: expect.objectContaining({ scenario: 1 }),
      storageInfo: {
        usage: 10,
        quota: 20,
        usageRatio: 0.5,
      },
    })
  );
  expect(headerPropsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      folderFilter: withStorage.state.filters.folderFilter,
      search: withStorage.state.filters.search,
      sortMode: withStorage.state.filters.sortMode,
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

  expect(sidebarPropsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      storageInfo: {
        usage: 10,
        quota: 40,
        usageRatio: 0.25,
        isPersistent: true,
      },
    })
  );
});
