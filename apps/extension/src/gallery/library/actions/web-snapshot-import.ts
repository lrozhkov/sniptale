import { openWebSnapshotViewerPage } from '../../../platform/navigation/extension-pages';
import { translate } from '../../../platform/i18n';
import {
  importWebSnapshotPackage,
  inspectWebSnapshotImport,
} from '../../../workflows/page-package/import';
import type { GalleryImportController } from './controller-types';
import type { GalleryBusyAction } from './shared';
import { createGalleryUserFacingActionError } from './shared';

function importErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/standard Web Snapshot|unsupported|manifest is invalid/iu.test(message)) {
    return translate('gallery.importModal.webSnapshotUnsupported');
  }
  if (/too large|resource profile|too many|byte budget|safe limits/iu.test(message)) {
    return translate('gallery.importModal.webSnapshotLimits');
  }
  return translate('gallery.importModal.webSnapshotInvalid');
}

export function createInspectWebSnapshotImportAction(
  controller: GalleryImportController,
  withBusy: GalleryBusyAction
) {
  return async (file: File | null): Promise<void> => {
    if (!file) return;
    await withBusy(async () => {
      try {
        const inspection = await inspectWebSnapshotImport(file);
        controller.actions.surface.setPendingWebSnapshotImport({ file, inspection });
      } catch (error) {
        throw createGalleryUserFacingActionError(importErrorMessage(error));
      }
    });
    if (controller.refs.webSnapshotImportInputRef.current) {
      controller.refs.webSnapshotImportInputRef.current.value = '';
    }
  };
}

export function createInspectDroppedWebSnapshotImportAction(
  controller: GalleryImportController,
  inspectFile: ReturnType<typeof createInspectWebSnapshotImportAction>
) {
  return async (files: File[]): Promise<void> => {
    if (files.length !== 1) {
      controller.actions.surface.setBanner(
        translate('gallery.importModal.webSnapshotDropSingleFile')
      );
      return;
    }
    await inspectFile(files[0] ?? null);
  };
}

export function createConfirmWebSnapshotImportAction(
  controller: GalleryImportController,
  withBusy: GalleryBusyAction
) {
  return async (): Promise<void> => {
    const pending = controller.state.storage.pendingWebSnapshotImport;
    if (!pending) return;
    await withBusy(async () => {
      let assetId: string;
      try {
        ({ assetId } = await importWebSnapshotPackage(pending.file));
      } catch (error) {
        throw createGalleryUserFacingActionError(importErrorMessage(error));
      }
      controller.actions.surface.setPendingWebSnapshotImport(null);
      let refreshFailed = false;
      try {
        await controller.actions.storage.refresh();
      } catch {
        refreshFailed = true;
      }
      try {
        await openWebSnapshotViewerPage(assetId);
      } catch {
        controller.actions.surface.setBanner(
          translate('gallery.importModal.webSnapshotImportedOpenFailed')
        );
        return;
      }
      if (refreshFailed) {
        controller.actions.surface.setBanner(
          translate('gallery.importModal.webSnapshotImportedRefreshFailed')
        );
      }
    });
  };
}
