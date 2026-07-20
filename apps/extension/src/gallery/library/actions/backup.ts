import {
  createMediaHubBackupExportOptions,
  exportMediaHubBackup,
  importMediaHubBackup,
  inspectLocalMediaHubBackup,
  inspectMediaHubBackup,
  type MediaHubBackupExportOptions,
  type MediaHubImportConflictStrategy,
} from '../../../workflows/media-hub-backup/index';
import type { GalleryBackupExportController, GalleryImportController } from './controller-types';
import type { GalleryItem } from '../items';
import { isGalleryMediaItem, isGalleryScenarioItem, isGalleryVideoProjectItem } from '../items';
import { downloadBlob, type GalleryBusyAction } from './shared';

const activeBackupExportAbortControllers = new WeakMap<
  GalleryBackupExportController,
  AbortController
>();

function buildSelectedBackupScope(
  items: GalleryItem[]
): NonNullable<MediaHubBackupExportOptions['selected']> {
  return {
    mediaAssetIds: items.filter(isGalleryMediaItem).map((item) => item.entityId ?? item.id),
    scenarioProjectIds: items.filter(isGalleryScenarioItem).map((item) => item.entityId),
    videoProjectIds: items.filter(isGalleryVideoProjectItem).map((item) => item.entityId),
  };
}

function hasSelectedBackupScope(
  selected: NonNullable<MediaHubBackupExportOptions['selected']>
): boolean {
  return Boolean(
    selected &&
    (selected.mediaAssetIds.length > 0 ||
      selected.scenarioProjectIds.length > 0 ||
      selected.videoProjectIds.length > 0)
  );
}

function createInitialBackupExportOptions(
  controller: GalleryBackupExportController
): MediaHubBackupExportOptions {
  const selected = buildSelectedBackupScope(controller.state.selection.selectedItems);
  if (!hasSelectedBackupScope(selected)) {
    return createMediaHubBackupExportOptions();
  }

  return createMediaHubBackupExportOptions({
    scope: 'selected',
    selected,
  });
}

export function createExportBackupAction(
  controller: GalleryBackupExportController,
  withBusy: GalleryBusyAction
) {
  return async () => {
    await withBusy(async () => {
      const options = createInitialBackupExportOptions(controller);
      const summary = await inspectLocalMediaHubBackup(options);
      controller.actions.surface.setPendingExport({ options, summary });
    });
  };
}

export function createConfirmExportBackupAction(controller: GalleryBackupExportController) {
  return async (options: MediaHubBackupExportOptions, withBusy: GalleryBusyAction) => {
    await withBusy(async () => {
      activeBackupExportAbortControllers.get(controller)?.abort();
      const abortController = new AbortController();
      activeBackupExportAbortControllers.set(controller, abortController);
      try {
        const summary = await inspectLocalMediaHubBackup(options);
        if (abortController.signal.aborted) {
          return;
        }
        controller.actions.surface.setPendingExport({ options, summary });
        const result = await exportMediaHubBackup(options, { signal: abortController.signal });
        if (abortController.signal.aborted) {
          return;
        }
        downloadBlob(
          result,
          `media-hub-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`
        );
        controller.actions.surface.setPendingExport(null);
        await controller.actions.storage.refresh();
      } finally {
        if (activeBackupExportAbortControllers.get(controller) === abortController) {
          activeBackupExportAbortControllers.delete(controller);
        }
      }
    });
  };
}

export function createClosePendingExportAction(controller: GalleryBackupExportController) {
  return () => {
    activeBackupExportAbortControllers.get(controller)?.abort();
    activeBackupExportAbortControllers.delete(controller);
    controller.actions.surface.setPendingExport(null);
  };
}

export function createInspectExportBackupAction() {
  return async (options: MediaHubBackupExportOptions) => inspectLocalMediaHubBackup(options);
}

export function createImportSelectedFileAction(controller: GalleryImportController) {
  return async (file: File | null, withBusy: GalleryBusyAction) => {
    if (!file) {
      return;
    }

    await withBusy(async () => {
      const summary = await inspectMediaHubBackup(file);
      controller.actions.surface.setPendingImport({ file, summary });
    });

    if (controller.refs.importInputRef.current) {
      controller.refs.importInputRef.current.value = '';
    }
  };
}

export function createImportAction(controller: GalleryImportController) {
  return async (strategy: MediaHubImportConflictStrategy, withBusy: GalleryBusyAction) => {
    const pendingImport = controller.state.storage.pendingImport;
    if (!pendingImport) {
      return;
    }

    await withBusy(async () => {
      await importMediaHubBackup(pendingImport.file, strategy);
      controller.actions.surface.setPendingImport(null);
      await controller.actions.storage.refresh();
    });
  };
}
