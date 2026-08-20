import type {
  MediaHubBackupExportOptions,
  MediaHubImportConflictStrategy,
} from '../../../workflows/media-hub-backup/index';
import type { StorageCleanupGroup } from '../../../features/media-hub/types';
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
import {
  createApplySelectionTagAction,
  createDeleteManyAction,
  createSelectionZipAction,
  createStorageCleanupAction,
} from './selection';
import { createBusyActionRunner } from './shared';
import { openSnapshotScreenshotInEditor } from './snapshot-screenshot';
import type { UseGalleryAppActionsResult } from './useGalleryAppActions.types';

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
  handleApplySelectionTag: () => Promise<void>;
  handleImport: (strategy: MediaHubImportConflictStrategy) => Promise<void>;
  handleImportSelectedFile: (file: File | null) => Promise<void>;
  handlePreviewClose: () => Promise<void>;
  handleSaveMetadata: () => Promise<void>;
  handleSelectionZip: () => Promise<void>;
  handleStorageCleanup: (group: StorageCleanupGroup) => Promise<void>;
  withBusy: ReturnType<typeof createBusyActionRunner>;
}): UseGalleryAppActionsResult {
  const { controller, withBusy } = args;

  return {
    backup: args.backupActions,
    importing: {
      closePendingImport: createClosePendingImportAction(controller),
      importBackup: args.handleImport,
      importSelectedFile: args.handleImportSelectedFile,
    },
    preview: {
      close: args.handlePreviewClose,
      copy: () => void copyPreviewItem(controller, withBusy),
      download: () => void downloadPreviewItem(controller, withBusy),
      downloadOriginal: () => void downloadOriginalPreviewItem(controller, withBusy),
      openInEditor,
      openSnapshotScreenshotInEditor: () =>
        void openSnapshotScreenshotInEditor(controller, withBusy),
      resetChanges: () => resetPreviewChanges(controller),
      restoreOriginal: createRestoreOriginalAction(controller, withBusy),
      saveCopy: () => void createSaveImageCopyAction(controller, withBusy)(),
      saveMetadata: args.handleSaveMetadata,
    },
    selection: {
      applyTag: args.handleApplySelectionTag,
      deleteMany: args.deleteMany,
      downloadZip: args.handleSelectionZip,
    },
    storage: {
      cleanup: args.handleStorageCleanup,
    },
  };
}

export function useGalleryAppActions({ ...controller }: GalleryAppActionsController) {
  const withBusy = createBusyActionRunner(controller);
  const deleteMany = (targets: GalleryItem[]) =>
    createDeleteManyAction(controller)(targets, withBusy);
  const handleStorageCleanup = (group: StorageCleanupGroup) =>
    createStorageCleanupAction(controller)(group, withBusy);
  const backupActions = createGalleryBackupActions(controller, withBusy);
  const handleImportSelectedFile = (file: File | null) =>
    createImportSelectedFileAction(controller)(file, withBusy);
  const handleImport = (strategy: MediaHubImportConflictStrategy) =>
    createImportAction(controller)(strategy, withBusy);
  const handleSelectionZip = () => createSelectionZipAction(controller)(withBusy);
  const handleSaveMetadata = () => createSaveMetadataAction(controller)(withBusy);
  const handleApplySelectionTag = () => createApplySelectionTagAction(controller)(withBusy);
  const handlePreviewClose = () => createClosePreviewAction(controller)(withBusy);

  return buildGalleryAppActionsResult({
    backupActions,
    controller,
    deleteMany,
    handleApplySelectionTag,
    handleImport,
    handleImportSelectedFile,
    handlePreviewClose,
    handleSaveMetadata,
    handleSelectionZip,
    handleStorageCleanup,
    withBusy,
  });
}
