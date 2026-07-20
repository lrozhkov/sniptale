// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  createCleanupGroup,
  createController,
  createMediaItem,
  runBusyAction,
} from './test-support/index';
import { useGalleryAppActions } from './useGalleryAppActions';

const helperMocks = vi.hoisted(() => ({
  copyPreviewItemMock: vi.fn(async () => undefined),
  createApplySelectionTagActionMock: vi.fn(),
  createBusyActionRunnerMock: vi.fn(),
  createClosePendingExportActionMock: vi.fn(),
  createClosePreviewActionMock: vi.fn(),
  createConfirmExportBackupActionMock: vi.fn(),
  createDeleteManyActionMock: vi.fn(),
  createExportBackupActionMock: vi.fn(),
  createInspectExportBackupActionMock: vi.fn(),
  createImportActionMock: vi.fn(),
  createImportSelectedFileActionMock: vi.fn(),
  createSaveMetadataActionMock: vi.fn(),
  createSelectionZipActionMock: vi.fn(),
  createStorageCleanupActionMock: vi.fn(),
  downloadPreviewItemMock: vi.fn(async () => undefined),
  openInEditorMock: vi.fn(),
  openSnapshotScreenshotInEditorMock: vi.fn(async () => undefined),
  resetPreviewChangesMock: vi.fn(),
}));

vi.mock('./helpers', () => ({
  copyPreviewItem: helperMocks.copyPreviewItemMock,
  createApplySelectionTagAction: helperMocks.createApplySelectionTagActionMock,
  createBusyActionRunner: helperMocks.createBusyActionRunnerMock,
  createClosePendingExportAction: helperMocks.createClosePendingExportActionMock,
  createClosePreviewAction: helperMocks.createClosePreviewActionMock,
  createConfirmExportBackupAction: helperMocks.createConfirmExportBackupActionMock,
  createDeleteManyAction: helperMocks.createDeleteManyActionMock,
  createExportBackupAction: helperMocks.createExportBackupActionMock,
  createInspectExportBackupAction: helperMocks.createInspectExportBackupActionMock,
  createImportAction: helperMocks.createImportActionMock,
  createImportSelectedFileAction: helperMocks.createImportSelectedFileActionMock,
  createSaveMetadataAction: helperMocks.createSaveMetadataActionMock,
  createSelectionZipAction: helperMocks.createSelectionZipActionMock,
  createStorageCleanupAction: helperMocks.createStorageCleanupActionMock,
  downloadPreviewItem: helperMocks.downloadPreviewItemMock,
  openInEditor: helperMocks.openInEditorMock,
  openSnapshotScreenshotInEditor: helperMocks.openSnapshotScreenshotInEditorMock,
  resetPreviewChanges: helperMocks.resetPreviewChangesMock,
}));

function prepareActionFactoryMocks() {
  helperMocks.createBusyActionRunnerMock.mockReturnValue(runBusyAction);
  helperMocks.createDeleteManyActionMock.mockReturnValue(vi.fn(async () => undefined));
  helperMocks.createStorageCleanupActionMock.mockReturnValue(vi.fn(async () => undefined));
  helperMocks.createClosePendingExportActionMock.mockReturnValue(vi.fn());
  helperMocks.createConfirmExportBackupActionMock.mockReturnValue(vi.fn(async () => undefined));
  helperMocks.createExportBackupActionMock.mockReturnValue(vi.fn(async () => undefined));
  helperMocks.createInspectExportBackupActionMock.mockReturnValue(vi.fn(async () => ({})));
  helperMocks.createImportSelectedFileActionMock.mockReturnValue(vi.fn(async () => undefined));
  helperMocks.createImportActionMock.mockReturnValue(vi.fn(async () => undefined));
  helperMocks.createClosePreviewActionMock.mockReturnValue(vi.fn(async () => undefined));
  helperMocks.createSelectionZipActionMock.mockReturnValue(vi.fn(async () => undefined));
  helperMocks.createSaveMetadataActionMock.mockReturnValue(vi.fn(async () => undefined));
  helperMocks.createApplySelectionTagActionMock.mockReturnValue(vi.fn(async () => undefined));
}

describe('useGalleryAppActions', () => {
  it('wires gallery action factories through the shared busy runner and preview helpers', async () => {
    vi.clearAllMocks();
    prepareActionFactoryMocks();
    const { controller } = createController({
      previewItem: createMediaItem({ id: 'asset-1' }),
    });
    const actions = useGalleryAppActions(controller);
    const backupOptions = {
      scope: 'all' as const,
      includeEditorDrafts: true,
      includeSourceMetadata: true,
      includeTelemetry: true,
      includeWebSnapshots: true,
    };

    await actions.selection.deleteMany([createMediaItem({ id: 'asset-2' })]);
    await actions.storage.cleanup(createCleanupGroup({ items: [] }));
    await actions.backup.exportBackup();
    await actions.backup.confirmExport(backupOptions);
    await actions.backup.inspectExport(backupOptions);
    await actions.importing.importSelectedFile(null);
    await actions.importing.importBackup('replace');
    await actions.selection.downloadZip();
    await actions.preview.saveMetadata();
    await actions.selection.applyTag();
    actions.preview.copy();
    actions.preview.download();
    actions.preview.openSnapshotScreenshotInEditor();
    actions.preview.openInEditor(createMediaItem({ id: 'asset-3' }));

    expect(helperMocks.createBusyActionRunnerMock).toHaveBeenCalledWith(controller);
    expect(helperMocks.createInspectExportBackupActionMock).toHaveBeenCalledTimes(1);
    expect(helperMocks.copyPreviewItemMock).toHaveBeenCalledWith(controller, runBusyAction);
    expect(helperMocks.downloadPreviewItemMock).toHaveBeenCalledWith(controller, runBusyAction);
    expect(helperMocks.openSnapshotScreenshotInEditorMock).toHaveBeenCalledWith(
      controller,
      runBusyAction
    );
    expect(helperMocks.openInEditorMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'asset-3' })
    );
  });
});
