// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGalleryState } from '../../library/actions/test-support/index';
import { GalleryOverlays } from './overlays';

const { backupExportPropsMock } = vi.hoisted(() => ({
  backupExportPropsMock: vi.fn(),
}));

vi.mock('@sniptale/ui/product-feedback/confirm-dialog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/confirm-dialog')>()),
  ProductConfirmDialog: () => null,
}));

vi.mock('../../library/modals', () => ({
  BackupExportModal: (props: unknown) => {
    backupExportPropsMock(props);
    return <div data-ui="test.backup-export-modal" />;
  },
  ImportConflictModal: () => null,
  StorageManagerModal: () => null,
}));

vi.mock('../../library/preview', () => ({
  PreviewPanel: () => null,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createCallbackProps() {
  return {
    onActiveTagsChange: vi.fn(),
    onAddTag: vi.fn(),
    onApplySelectionTag: vi.fn(),
    onBackupExportConfirm: vi.fn(),
    onBackupExportInspect: vi.fn(async () => createPendingExportState().summary),
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
  };
}

function createPendingExportState() {
  return {
    options: {
      scope: 'all' as const,
      includeEditorDrafts: true,
      includeSourceMetadata: true,
      includeTelemetry: true,
      includeWebSnapshots: true,
    },
    summary: {
      approximateSizeBytes: 4096,
      assetCount: 2,
      dataClasses: {
        editorDrafts: true,
        mediaAssets: true,
        recordings: true,
        scenarioProjects: true,
        sourceMetadata: true,
        telemetry: true,
        thumbnails: true,
        videoProjects: true,
        webSnapshots: true,
      },
      editorDraftCount: 1,
      recordingCount: 1,
      scenarioProjectCount: 0,
      selectedCount: 0,
      sourceMetadataCount: 2,
      thumbnailCount: 1,
      videoProjectCount: 0,
      webSnapshotCount: 1,
    },
  };
}

function createLayoutProps() {
  return {
    gridViewportRef: { current: null },
    importInputRef: { current: null },
    ...createCallbackProps(),
    state: createGalleryState({ pendingExport: createPendingExportState() }),
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

it('wires backup export overlay to parent app-shell callbacks', async () => {
  const props = createLayoutProps();

  act(() => {
    root?.render(<GalleryOverlays {...props} />);
  });

  const backupExportProps = backupExportPropsMock.mock.lastCall?.[0] as {
    onClose: () => void;
    onExport: (options: unknown) => Promise<void>;
    onInspect: (options: unknown) => Promise<unknown>;
    options: unknown;
    summary: unknown;
  };

  await backupExportProps.onExport({ scope: 'all' });
  await backupExportProps.onInspect({ scope: 'all' });
  backupExportProps.onClose();

  expect(backupExportProps.summary).toEqual(props.state.storage.pendingExport?.summary);
  expect(backupExportProps.options).toEqual(props.state.storage.pendingExport?.options);
  expect(props.onBackupExportConfirm).toHaveBeenCalledWith({ scope: 'all' });
  expect(props.onBackupExportInspect).toHaveBeenCalledWith({ scope: 'all' });
  expect(props.onPendingExportClose).toHaveBeenCalledTimes(1);
});
