// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGalleryState, createMediaItem } from '../../library/actions/test-support/index';
import { createLocalBackupSummary } from './backup-export.test-support';

const {
  confirmDialogPropsMock,
  importConflictPropsMock,
  mediaImportConflictPropsMock,
  previewPanelPropsMock,
} = vi.hoisted(() => ({
  confirmDialogPropsMock: vi.fn(),
  importConflictPropsMock: vi.fn(),
  mediaImportConflictPropsMock: vi.fn(),
  previewPanelPropsMock: vi.fn(),
}));

vi.mock('@sniptale/ui/product-feedback/confirm-dialog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/confirm-dialog')>()),
  ProductConfirmDialog: (props: unknown) => {
    confirmDialogPropsMock(props);
    return <div data-ui="test.confirm-dialog" />;
  },
}));

vi.mock('../../library/modals/backup-export-content', () => ({
  BackupExportModalContent: () => null,
}));

vi.mock('../../library/modals/import-conflict-content', () => ({
  ImportConflictModalContent: (props: unknown) => {
    importConflictPropsMock(props);
    return <div data-ui="test.import-modal" />;
  },
}));

vi.mock('../../library/modals/media-import-conflict-content', () => ({
  MediaImportConflictModalContent: (props: unknown) => {
    mediaImportConflictPropsMock(props);
    return <div data-ui="test.media-import-modal" />;
  },
}));

vi.mock('../../library/preview', () => ({
  PreviewPanel: (props: unknown) => {
    previewPanelPropsMock(props);
    return <div data-ui="test.preview-panel" />;
  },
}));

import { GalleryOverlays } from './overlays';

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
    onFilenameChange: vi.fn(),
    onFolderFilterChange: vi.fn(),
    onImport: vi.fn(),
    onImportBackupClick: vi.fn(),
    onImportMediaClick: vi.fn(),
    onImportFileChange: vi.fn(),
    onMediaImportFileChange: vi.fn(),
    onPendingExportClose: vi.fn(),
    onPendingImportClose: vi.fn(),
    onPendingMediaImportClose: vi.fn(),
    onMediaImportConfirm: vi.fn(),
    onPreviewClose: vi.fn(),
    onPreviewInspectorToggle: vi.fn(),
    onPreviewCopy: vi.fn(),
    onPreviewDelete: vi.fn(),
    onPreviewDownload: vi.fn(),
    onPreviewDownloadOriginal: vi.fn(),
    onPreviewEdit: vi.fn(),
    onPreviewOpen: vi.fn(),
    onPreviewNavigate: vi.fn(),
    onPreviewOpenSnapshotScreenshot: vi.fn(),
    onPreviewResetChanges: vi.fn(),
    onPreviewRestoreOriginal: vi.fn(),
    onPreviewSaveCopy: vi.fn(),
    onRemoveTag: vi.fn(),
    onResetFilters: vi.fn(),
    onSearchChange: vi.fn(),
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

function createOpenOverlayProps(onConfirm = vi.fn()) {
  const props = createLayoutProps();
  props.state = createGalleryState({
    confirmDialog: {
      cancelText: 'Cancel',
      confirmText: 'Delete',
      message: 'Confirm',
      onConfirm: async () => onConfirm(),
      title: 'Delete item',
    },
    pendingImport: {
      file: new File(['backup'], 'backup.zip', { type: 'application/zip' }),
      summary: {
        archiveFingerprint: 'a'.repeat(64),
        assetCount: 2,
        conflicts: ['asset-1'],
        manifest: {
          assetCount: 2,
          effectBundleCount: 0,
          exportedAt: '2026-03-31T00:00:00.000Z',
          format: 'sniptale-backup',
          thumbnailCount: 1,
          version: 1,
        },
        rootCount: 2,
        thumbnailCount: 1,
        totalBytes: 1024,
      },
    },
    previewItem: createMediaItem({ id: 'asset-7' }),
    previewInspectorCollapsed: false,
    previewUrl: 'blob:preview',
    previewDraft: {
      filename: 'capture.png',
      hasChanges: true,
      tagInput: 'draft',
      tags: ['alpha'],
    },
  });

  return props;
}

type PreviewOverlayProps = {
  item: { id: string };
  navigation?: {
    current: number;
    total: number;
    hasPrevious: boolean;
    hasNext: boolean;
    onPrevious: () => void;
    onNext: () => void;
  };
  onAddTag: () => void;
  onClose: () => void;
  onCopy: () => Promise<void>;
  onDelete: () => Promise<void>;
  onDownload: () => Promise<void>;
  onEdit: () => void;
  onFilenameChange: (value: string) => void;
  onInspectorToggle: () => void;
  onRemoveTag: (tag: string) => void;
  onResetChanges: () => void;
  onTagDraftChange: (value: string) => void;
  hasChanges: boolean;
  previewUrl: string;
  tagDraft: string;
  tagDrafts: string[];
};

async function invokePreviewCallbacks(previewProps: PreviewOverlayProps) {
  previewProps.onClose();
  previewProps.onInspectorToggle();
  previewProps.onFilenameChange('renamed.png');
  previewProps.onTagDraftChange('next-tag');
  previewProps.onRemoveTag('alpha');
  previewProps.onAddTag();
  previewProps.onResetChanges();
  await previewProps.onDownload();
  await previewProps.onCopy();
  previewProps.onEdit();
  await previewProps.onDelete();
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

it('renders no overlay surfaces when the app-shell state is closed', () => {
  const props = createLayoutProps();

  act(() => {
    root?.render(<GalleryOverlays {...props} />);
  });

  expect(container?.textContent).toBe('');
  expect(importConflictPropsMock).not.toHaveBeenCalled();
  expect(confirmDialogPropsMock).not.toHaveBeenCalled();
  expect(previewPanelPropsMock).not.toHaveBeenCalled();
});

it('wires import and confirm overlays to parent callbacks', async () => {
  const onConfirm = vi.fn();
  const props = createOpenOverlayProps(onConfirm);

  act(() => {
    root?.render(<GalleryOverlays {...props} />);
  });

  const importModalProps = importConflictPropsMock.mock.lastCall?.[0] as {
    onClose: () => void;
    onImport: (strategy: unknown) => Promise<void>;
    summary: unknown;
  };
  const confirmModalProps = confirmDialogPropsMock.mock.lastCall?.[0] as {
    dialogClassName: string;
    onCancel: () => void;
    onConfirm: () => void;
  };

  await importModalProps.onImport('replace');
  importModalProps.onClose();
  confirmModalProps.onCancel();
  confirmModalProps.onConfirm();

  expect(importModalProps.summary).toEqual(props.state.storage.pendingImport?.summary);
  expect(confirmModalProps.dialogClassName).toContain('!p-0');
  expect(confirmModalProps.dialogClassName).toContain('[&_.sniptale-modal-footer-sm]:!border-t-0');
  expect(confirmModalProps.dialogClassName).toContain(
    '[&_.sniptale-modal-footer-sm_button]:!rounded-[8px]'
  );
  expect(props.onImport).toHaveBeenCalledWith('replace');
  expect(props.onPendingImportClose).toHaveBeenCalledTimes(1);
  expect(props.onConfirmDialogClose).toHaveBeenCalledTimes(1);
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

it('wires local media conflict decisions through the dedicated overlay', () => {
  const props = createLayoutProps();
  props.state = createGalleryState({
    pendingMediaImport: {
      conflicts: [{ filename: 'capture.png', size: 1024 }],
      files: [new File(['image'], 'capture.png', { type: 'image/png' })],
    },
  });

  act(() => root?.render(<GalleryOverlays {...props} />));

  const modalProps = mediaImportConflictPropsMock.mock.lastCall?.[0] as {
    fileCount: number;
    onClose: () => void;
    onImport: (strategy: 'duplicate') => void;
  };
  expect(modalProps.fileCount).toBe(1);
  modalProps.onImport('duplicate');
  modalProps.onClose();
  expect(props.onMediaImportConfirm).toHaveBeenCalledWith('duplicate');
  expect(props.onPendingMediaImportClose).toHaveBeenCalledTimes(1);
});

it('wires preview overlay callbacks to the parent app-shell actions', async () => {
  const props = createOpenOverlayProps();

  act(() => {
    root?.render(<GalleryOverlays {...props} />);
  });

  const previewProps = previewPanelPropsMock.mock.lastCall?.[0] as PreviewOverlayProps;

  await invokePreviewCallbacks(previewProps);

  expect(previewProps.hasChanges).toBe(true);
  expect(previewProps.previewUrl).toBe('blob:preview');
  expect(previewProps.tagDraft).toBe('draft');
  expect(previewProps.tagDrafts).toEqual(['alpha']);
  expect(props.onPreviewClose).toHaveBeenCalledTimes(1);
  expect(props.onPreviewInspectorToggle).toHaveBeenCalledTimes(1);
  expect(props.onFilenameChange).toHaveBeenCalledWith('renamed.png');
  expect(props.onTagDraftChange).toHaveBeenCalledWith('next-tag');
  expect(props.onRemoveTag).toHaveBeenCalledWith('alpha');
  expect(props.onAddTag).toHaveBeenCalledTimes(1);
  expect(props.onPreviewResetChanges).toHaveBeenCalledTimes(1);
  expect(props.onPreviewDownload).toHaveBeenCalledTimes(1);
  expect(props.onPreviewCopy).toHaveBeenCalledTimes(1);
  expect(props.onPreviewEdit).toHaveBeenCalledWith(props.state.preview.session.item);
  expect(props.onPreviewDelete).toHaveBeenCalledWith(props.state.preview.session.item);
});

it('omits optional preview props when the preview draft has no reset state or tag catalog', () => {
  const { onPreviewResetChanges: _onPreviewResetChanges, ...props } = createOpenOverlayProps();
  props.state = createGalleryState({
    allTags: [],
    previewItem: createMediaItem({ id: 'asset-9' }),
    previewInspectorCollapsed: false,
    previewUrl: 'blob:preview',
    previewDraft: {
      filename: 'capture.png',
      hasChanges: false,
      tagInput: '',
      tags: [],
    },
  });

  act(() => {
    root?.render(<GalleryOverlays {...props} />);
  });

  const previewProps = previewPanelPropsMock.mock.lastCall?.[0] as Record<string, unknown>;

  expect(previewProps['allTags']).toBeUndefined();
  expect(previewProps['hasChanges']).toBeUndefined();
  expect(previewProps['onResetChanges']).toBeUndefined();
});

it('builds bounded previous and next navigation from the filtered media list', () => {
  const props = createLayoutProps();
  const items = [
    createMediaItem({ id: 'asset-1' }),
    createMediaItem({ id: 'asset-2' }),
    createMediaItem({ id: 'asset-3' }),
  ];
  props.state = createGalleryState({
    filteredItems: items,
    previewItem: items[1] ?? null,
    previewUrl: 'blob:preview',
  });

  act(() => {
    root?.render(<GalleryOverlays {...props} />);
  });

  const previewProps = previewPanelPropsMock.mock.lastCall?.[0] as PreviewOverlayProps;
  expect(previewProps.navigation).toMatchObject({
    current: 2,
    total: 3,
    hasPrevious: true,
    hasNext: true,
  });
  act(() => {
    previewProps.navigation?.onPrevious();
    previewProps.navigation?.onNext();
  });
  expect(props.onPreviewNavigate).toHaveBeenNthCalledWith(1, items[0]);
  expect(props.onPreviewNavigate).toHaveBeenNthCalledWith(2, items[2]);
});
