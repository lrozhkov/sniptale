import type {
  MediaHubBackupExportOptions,
  MediaHubImportConflictStrategy,
} from '../../../workflows/media-hub-backup/index';
import type {
  GalleryImportController,
  GalleryBackupExportController,
  GalleryPreviewController,
  GallerySelectionController,
  GallerySurfaceController,
} from './controller-types';
import type { GalleryItem } from '../items';
import {
  createClosePendingImportAction,
  createCancelActiveImportAction,
  createDismissActiveImportAction,
  createClosePendingExportAction,
  createConfirmExportBackupAction,
  createExportBackupAction,
  createInspectExportBackupAction,
  createImportAction,
  createImportSelectedFileAction,
} from './backup';
import {
  copyPreviewItem,
  createClosePreviewAction,
  createSaveMetadataAction,
  downloadPreviewItem,
  downloadOriginalPreviewItem,
  createRestoreOriginalAction,
  createSaveImageCopyAction,
  openInEditor,
  resetPreviewChanges,
} from './preview';
import { createNavigatePreviewAction } from './preview-navigation';
import { createApplySelectionTagAction, createDeleteManyAction } from './selection';
import { createSelectionBackupAction, createSelectionZipAction } from './selection-export';
import { createBusyActionRunner } from './shared';
import { openSnapshotScreenshotInEditor } from './snapshot-screenshot';
import type { UseGalleryAppActionsResult } from './useGalleryAppActions.types';
import { createImportMediaFilesAction } from './media-file-import';
import type { MediaFileImportConflictStrategy } from '../import-types';
import {
  createConfirmWebSnapshotImportAction,
  createImportDroppedLibraryFilesAction,
  createInspectWebSnapshotImportAction,
} from './web-snapshot-import';

function createGalleryBackupActions(
  controller: GalleryBackupExportController,
  withBusy: ReturnType<typeof createBusyActionRunner>
) {
  return {
    closePendingExport: createClosePendingExportAction(controller),
    confirmExport: (options: MediaHubBackupExportOptions) =>
      createConfirmExportBackupAction(controller)(options, withBusy),
    exportBackup: createExportBackupAction(controller, withBusy),
    inspectExport: createInspectExportBackupAction(),
  };
}

type GalleryAppActionsController = GallerySelectionController &
  GalleryPreviewController &
  GalleryImportController &
  GalleryBackupExportController &
  GallerySurfaceController;

function buildGalleryAppActionsResult(args: {
  backupActions: ReturnType<typeof createGalleryBackupActions>;
  controller: GalleryAppActionsController;
  deleteMany: (targets: GalleryItem[]) => Promise<void>;
  handleApplySelectionTag: (tag?: string) => Promise<void>;
  handleImport: (strategy: MediaHubImportConflictStrategy) => Promise<void>;
  handleImportSelectedFile: (file: File | null) => Promise<void>;
  handleImportMediaFiles: (files: File[]) => Promise<void>;
  handleConfirmMediaFileImport: (strategy: MediaFileImportConflictStrategy) => Promise<void>;
  handlePreviewClose: () => Promise<void>;
  handleSaveMetadata: () => Promise<void>;
  handleSelectionBackup: () => Promise<void>;
  handleSelectionZip: () => Promise<void>;
  withBusy: ReturnType<typeof createBusyActionRunner>;
}): UseGalleryAppActionsResult {
  const { controller, withBusy } = args;
  const inspectWebSnapshot = createInspectWebSnapshotImportAction(controller, withBusy);

  return {
    backup: args.backupActions,
    importing: {
      cancelActiveImport: createCancelActiveImportAction(controller),
      closePendingImport: createClosePendingImportAction(controller),
      closePendingMediaImport: () => controller.actions.surface.setPendingMediaImport(null),
      closePendingWebSnapshotImport: () =>
        controller.actions.surface.setPendingWebSnapshotImport(null),
      confirmWebSnapshotImport: createConfirmWebSnapshotImportAction(controller, withBusy),
      confirmMediaFileImport: args.handleConfirmMediaFileImport,
      dismissActiveImport: createDismissActiveImportAction(controller),
      importBackup: args.handleImport,
      importSelectedFile: args.handleImportSelectedFile,
      importMediaFiles: args.handleImportMediaFiles,
      importDroppedFiles: createImportDroppedLibraryFilesAction(
        controller,
        inspectWebSnapshot,
        args.handleImportMediaFiles
      ),
      inspectWebSnapshot,
    },
    preview: {
      close: args.handlePreviewClose,
      copy: () => void copyPreviewItem(controller, withBusy),
      download: () => void downloadPreviewItem(controller, withBusy),
      downloadOriginal: () => void downloadOriginalPreviewItem(controller, withBusy),
      navigate: (target: GalleryItem) => createNavigatePreviewAction(controller)(target, withBusy),
      openInEditor,
      openSnapshotScreenshotInEditor: () =>
        void openSnapshotScreenshotInEditor(controller, withBusy),
      resetChanges: () => resetPreviewChanges(controller),
      restoreOriginal: createRestoreOriginalAction(controller, withBusy),
      saveCopy: () => void createSaveImageCopyAction(controller, withBusy)(),
      saveMetadata: args.handleSaveMetadata,
    },
    selection: {
      applyTag: (tag?: string) => args.handleApplySelectionTag(tag),
      deleteMany: args.deleteMany,
      downloadBackup: args.handleSelectionBackup,
      downloadZip: args.handleSelectionZip,
    },
  };
}

export function useGalleryAppActions({ ...controller }: GalleryAppActionsController) {
  const withBusy = createBusyActionRunner(controller);
  const deleteMany = (targets: GalleryItem[]) =>
    createDeleteManyAction(controller)(targets, withBusy);
  const backupActions = createGalleryBackupActions(controller, withBusy);
  const handleImportSelectedFile = (file: File | null) =>
    createImportSelectedFileAction(controller)(file, withBusy);
  const handleImportMediaFiles = createImportMediaFilesAction(controller, withBusy);
  const handleConfirmMediaFileImport = (strategy: MediaFileImportConflictStrategy) => {
    const pending = controller.state.storage.pendingMediaImport;
    return pending ? handleImportMediaFiles(pending.files, strategy) : Promise.resolve();
  };
  const handleImport = (strategy: MediaHubImportConflictStrategy) =>
    createImportAction(controller)(strategy, withBusy);
  const handleSelectionZip = () => createSelectionZipAction(controller)(withBusy);
  const handleSelectionBackup = () => createSelectionBackupAction(controller)(withBusy);
  const handleSaveMetadata = () => createSaveMetadataAction(controller)(withBusy);
  const handleApplySelectionTag = (tag?: string) =>
    createApplySelectionTagAction(controller)(withBusy, tag);
  const handlePreviewClose = () => createClosePreviewAction(controller)(withBusy);

  return buildGalleryAppActionsResult({
    backupActions,
    controller,
    deleteMany,
    handleApplySelectionTag,
    handleImport,
    handleImportSelectedFile,
    handleImportMediaFiles,
    handleConfirmMediaFileImport,
    handlePreviewClose,
    handleSaveMetadata,
    handleSelectionBackup,
    handleSelectionZip,
    withBusy,
  });
}
