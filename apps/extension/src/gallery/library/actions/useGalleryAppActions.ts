import type { GalleryDeletionOpening } from '../deletion/types';
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
import { useRef } from 'react';
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
import {
  createNavigatePreviewAction,
  createPreviewNavigationCoordinator,
  previewDraftKey,
  savePreviewDraftAfterPending,
  type PreviewNavigationCoordinator,
} from './preview-navigation';
import {
  createApplySelectionTagAction,
  createDeleteManyAction,
  createRestoreTrashAction,
} from './selection';
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
  deleteMany: (targets: GalleryItem[], opening?: GalleryDeletionOpening) => Promise<void>;
  handleApplySelectionTag: (tag?: string) => Promise<void>;
  handleImport: (strategy: MediaHubImportConflictStrategy) => Promise<void>;
  handleImportSelectedFile: (file: File | null) => Promise<void>;
  handleImportMediaFiles: (files: File[]) => Promise<void>;
  handleConfirmMediaFileImport: (strategy: MediaFileImportConflictStrategy) => Promise<void>;
  handlePreviewClose: () => Promise<void>;
  handleSaveMetadata: () => Promise<void>;
  handleSelectionBackup: () => Promise<void>;
  handleSelectionZip: () => Promise<void>;
  navigationCoordinator: PreviewNavigationCoordinator;
  readPreviewState: () => GalleryPreviewController['state'];
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
      copy: () => copyPreviewItem(controller, withBusy),
      download: () => downloadPreviewItem(controller, withBusy),
      downloadOriginal: () => downloadOriginalPreviewItem(controller, withBusy),
      navigate: (target: GalleryItem) =>
        createNavigatePreviewAction(
          controller,
          args.navigationCoordinator,
          args.readPreviewState
        )(target, withBusy),
      openInEditor,
      openSnapshotScreenshotInEditor: () =>
        void openSnapshotScreenshotInEditor(controller, withBusy),
      resetChanges: () => resetPreviewChanges(controller),
      restoreOriginal: createRestoreOriginalAction(controller, withBusy),
      saveCopy: () => createSaveImageCopyAction(controller, withBusy)(),
      saveMetadata: args.handleSaveMetadata,
    },
    selection: {
      applyTag: (tag?: string) => args.handleApplySelectionTag(tag),
      deleteMany: args.deleteMany,
      restoreTrash: (targets) => createRestoreTrashAction(controller)(targets, withBusy),
      downloadBackup: args.handleSelectionBackup,
      downloadZip: args.handleSelectionZip,
    },
  };
}

export function useGalleryAppActions(controller: GalleryAppActionsController) {
  const controllerRef = useRef(controller);
  controllerRef.current = controller;
  const navigationCoordinatorRef = useRef(createPreviewNavigationCoordinator());
  const readPreviewState = () => controllerRef.current.state;
  const withBusy = createBusyActionRunner(controller);
  const deleteMany = (targets: GalleryItem[], opening?: GalleryDeletionOpening) =>
    createDeleteManyAction(controller, () => controllerRef.current)(targets, withBusy, opening);
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
  const handlePreviewClose = async () => {
    const coordinator = navigationCoordinatorRef.current;
    const requestRevision = ++coordinator.revision;
    const sourceId = readPreviewState().preview.session.item?.id;
    const pending = coordinator.pendingSave;
    if (pending && pending.sourceId === sourceId) {
      try {
        await pending.promise;
      } catch {
        // The close action retries the current draft and keeps it open if that retry fails.
      }
    }
    if (coordinator.revision !== requestRevision) return;
    const latestController = controllerRef.current;
    const source = latestController.state.preview.session.item;
    if (!source) return;
    const draft = latestController.state.preview.draft;
    const draftKey = previewDraftKey(draft);
    await createClosePreviewAction(
      latestController,
      () =>
        coordinator.revision === requestRevision &&
        readPreviewState().preview.session.item?.id === sourceId &&
        previewDraftKey(readPreviewState().preview.draft) === draftKey,
      async () => {
        const changed = await savePreviewDraftAfterPending(
          latestController,
          coordinator,
          source,
          draft,
          () =>
            coordinator.revision === requestRevision &&
            readPreviewState().preview.session.item?.id === sourceId &&
            previewDraftKey(readPreviewState().preview.draft) === draftKey
        );
        if (changed === null) return false;
        return changed || coordinator.refreshDue;
      }
    )(withBusy);
    if (readPreviewState().preview.session.item?.id !== sourceId) {
      coordinator.refreshDue = false;
    }
  };

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
    navigationCoordinator: navigationCoordinatorRef.current,
    readPreviewState,
    withBusy,
  });
}
