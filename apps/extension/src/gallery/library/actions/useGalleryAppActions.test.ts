// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createController, createMediaItem, runBusyAction } from './test-support/index';
import { useGalleryAppActions } from './useGalleryAppActions';

const actionMocks = vi.hoisted(() => ({
  copyPreviewItemMock: vi.fn(async () => undefined),
  createCancelActiveImportActionMock: vi.fn(),
  createDismissActiveImportActionMock: vi.fn(),
  createApplySelectionTagActionMock: vi.fn(),
  createBusyActionRunnerMock: vi.fn(),
  createClosePendingImportActionMock: vi.fn(),
  createClosePendingExportActionMock: vi.fn(),
  createClosePreviewActionMock: vi.fn(),
  createConfirmExportBackupActionMock: vi.fn(),
  createDeleteManyActionMock: vi.fn(),
  createExportBackupActionMock: vi.fn(),
  createInspectExportBackupActionMock: vi.fn(),
  createImportActionMock: vi.fn(),
  createImportMediaFilesActionMock: vi.fn(),
  createImportSelectedFileActionMock: vi.fn(),
  createNavigatePreviewActionMock: vi.fn(),
  createSaveMetadataActionMock: vi.fn(),
  createRestoreOriginalActionMock: vi.fn(),
  createSaveImageCopyActionMock: vi.fn(),
  createSelectionBackupActionMock: vi.fn(),
  createSelectedBackupExportOptionsMock: vi.fn(),
  createSelectionZipActionMock: vi.fn(),
  downloadPreviewItemMock: vi.fn(async () => undefined),
  downloadOriginalPreviewItemMock: vi.fn(async () => undefined),
  openInEditorMock: vi.fn(),
  openSnapshotScreenshotInEditorMock: vi.fn(async () => undefined),
  resetPreviewChangesMock: vi.fn(),
}));

vi.mock('./backup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./backup')>()),
  createCancelActiveImportAction: actionMocks.createCancelActiveImportActionMock,
  createClosePendingImportAction: actionMocks.createClosePendingImportActionMock,
  createClosePendingExportAction: actionMocks.createClosePendingExportActionMock,
  createConfirmExportBackupAction: actionMocks.createConfirmExportBackupActionMock,
  createExportBackupAction: actionMocks.createExportBackupActionMock,
  createImportAction: actionMocks.createImportActionMock,
  createImportSelectedFileAction: actionMocks.createImportSelectedFileActionMock,
  createInspectExportBackupAction: actionMocks.createInspectExportBackupActionMock,
  createSelectedBackupExportOptions: actionMocks.createSelectedBackupExportOptionsMock,
  createDismissActiveImportAction: actionMocks.createDismissActiveImportActionMock,
}));

vi.mock('./preview', () => ({
  copyPreviewItem: actionMocks.copyPreviewItemMock,
  createClosePreviewAction: actionMocks.createClosePreviewActionMock,
  createSaveMetadataAction: actionMocks.createSaveMetadataActionMock,
  createRestoreOriginalAction: actionMocks.createRestoreOriginalActionMock,
  createSaveImageCopyAction: actionMocks.createSaveImageCopyActionMock,
  downloadPreviewItem: actionMocks.downloadPreviewItemMock,
  downloadOriginalPreviewItem: actionMocks.downloadOriginalPreviewItemMock,
  openInEditor: actionMocks.openInEditorMock,
  resetPreviewChanges: actionMocks.resetPreviewChangesMock,
}));

vi.mock('./preview-navigation', () => ({
  createNavigatePreviewAction: actionMocks.createNavigatePreviewActionMock,
}));

vi.mock('./media-file-import', () => ({
  createImportMediaFilesAction: actionMocks.createImportMediaFilesActionMock,
}));

vi.mock('./selection', () => ({
  createApplySelectionTagAction: actionMocks.createApplySelectionTagActionMock,
  createDeleteManyAction: actionMocks.createDeleteManyActionMock,
}));

vi.mock('./selection-export', () => ({
  createSelectionBackupAction: actionMocks.createSelectionBackupActionMock,
  createSelectionZipAction: actionMocks.createSelectionZipActionMock,
}));

vi.mock('./shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shared')>()),
  createBusyActionRunner: actionMocks.createBusyActionRunnerMock,
}));

vi.mock('./snapshot-screenshot', () => ({
  openSnapshotScreenshotInEditor: actionMocks.openSnapshotScreenshotInEditorMock,
}));

function prepareActionFactoryMocks() {
  actionMocks.createBusyActionRunnerMock.mockReturnValue(runBusyAction);
  actionMocks.createDeleteManyActionMock.mockReturnValue(vi.fn(async () => undefined));
  actionMocks.createClosePendingExportActionMock.mockReturnValue(vi.fn());
  actionMocks.createClosePendingImportActionMock.mockReturnValue(vi.fn());
  actionMocks.createCancelActiveImportActionMock.mockReturnValue(vi.fn());
  actionMocks.createDismissActiveImportActionMock.mockReturnValue(vi.fn());
  actionMocks.createConfirmExportBackupActionMock.mockReturnValue(vi.fn(async () => undefined));
  actionMocks.createExportBackupActionMock.mockReturnValue(vi.fn(async () => undefined));
  actionMocks.createInspectExportBackupActionMock.mockReturnValue(vi.fn(async () => ({})));
  actionMocks.createImportSelectedFileActionMock.mockReturnValue(vi.fn(async () => undefined));
  actionMocks.createImportMediaFilesActionMock.mockReturnValue(vi.fn(async () => undefined));
  actionMocks.createImportActionMock.mockReturnValue(vi.fn(async () => undefined));
  actionMocks.createClosePreviewActionMock.mockReturnValue(vi.fn(async () => undefined));
  actionMocks.createNavigatePreviewActionMock.mockReturnValue(vi.fn(async () => undefined));
  actionMocks.createSelectionBackupActionMock.mockReturnValue(vi.fn(async () => undefined));
  actionMocks.createSelectionZipActionMock.mockReturnValue(vi.fn(async () => undefined));
  actionMocks.createSaveMetadataActionMock.mockReturnValue(vi.fn(async () => undefined));
  actionMocks.createApplySelectionTagActionMock.mockReturnValue(vi.fn(async () => undefined));
  actionMocks.createRestoreOriginalActionMock.mockReturnValue(vi.fn());
  actionMocks.createSaveImageCopyActionMock.mockReturnValue(vi.fn(async () => undefined));
}

describe('useGalleryAppActions', () => {
  it('wires gallery action factories through the shared busy runner and preview helpers', async () => {
    vi.clearAllMocks();
    prepareActionFactoryMocks();
    const { controller, getState } = createController({
      previewItem: createMediaItem({ id: 'asset-1' }),
    });
    const actions = useGalleryAppActions(controller);
    const backupOptions = {
      includeDrafts: false,
      scope: 'all' as const,
      includeSourceMetadata: true,
      includeTelemetry: true,
      includeWebSnapshots: true,
    };

    await actions.selection.deleteMany([createMediaItem({ id: 'asset-2' })]);
    await actions.backup.exportBackup();
    await actions.backup.confirmExport(backupOptions);
    await actions.backup.inspectExport(backupOptions);
    await actions.importing.importSelectedFile(null);
    await actions.importing.importBackup('replace');
    actions.importing.closePendingImport();
    actions.importing.closePendingMediaImport();
    await actions.importing.importMediaFiles([]);
    await actions.importing.confirmMediaFileImport('skip');
    actions.importing.cancelActiveImport();
    actions.importing.dismissActiveImport();
    await actions.selection.downloadBackup();
    await actions.selection.downloadZip();
    await actions.preview.saveMetadata();
    await actions.preview.navigate(createMediaItem({ id: 'asset-next' }));
    await actions.selection.applyTag();
    actions.preview.copy();
    actions.preview.download();
    actions.preview.downloadOriginal();
    actions.preview.restoreOriginal();
    actions.preview.saveCopy();
    actions.preview.openSnapshotScreenshotInEditor();
    actions.preview.openInEditor(createMediaItem({ id: 'asset-3' }));

    expect(actionMocks.createBusyActionRunnerMock).toHaveBeenCalledWith(controller);
    expect(actions.importing.inspectDroppedWebSnapshot).toEqual(expect.any(Function));
    expect(getState().storage.pendingMediaImport).toBeNull();
    expect(actionMocks.createInspectExportBackupActionMock).toHaveBeenCalledTimes(1);
    expect(actionMocks.createNavigatePreviewActionMock).toHaveBeenCalledWith(controller);
    expect(actionMocks.copyPreviewItemMock).toHaveBeenCalledWith(controller, runBusyAction);
    expect(actionMocks.downloadPreviewItemMock).toHaveBeenCalledWith(controller, runBusyAction);
    expect(actionMocks.downloadOriginalPreviewItemMock).toHaveBeenCalledWith(
      controller,
      runBusyAction
    );
    expect(actionMocks.createRestoreOriginalActionMock).toHaveBeenCalledWith(
      controller,
      runBusyAction
    );
    expect(actionMocks.createSaveImageCopyActionMock).toHaveBeenCalledWith(
      controller,
      runBusyAction
    );
    expect(actionMocks.openSnapshotScreenshotInEditorMock).toHaveBeenCalledWith(
      controller,
      runBusyAction
    );
    expect(actionMocks.openInEditorMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'asset-3' })
    );
  });

  it('confirms a pending media import with the selected conflict strategy', async () => {
    vi.clearAllMocks();
    prepareActionFactoryMocks();
    const pendingFiles = [new File(['image'], 'photo.png', { type: 'image/png' })];
    const { controller } = createController({
      pendingMediaImport: { conflicts: [], files: pendingFiles },
    });
    const importMediaFiles = vi.fn(async () => undefined);
    actionMocks.createImportMediaFilesActionMock.mockReturnValue(importMediaFiles);

    const actions = useGalleryAppActions(controller);
    await actions.importing.confirmMediaFileImport('duplicate');

    expect(importMediaFiles).toHaveBeenCalledWith(pendingFiles, 'duplicate');
  });
});
