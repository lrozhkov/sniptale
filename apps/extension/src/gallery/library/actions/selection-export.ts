import {
  createArchivePathAllocator,
  createArchiveWriter,
  createDirectFileSink,
} from '../../../composition/archive-transfer';
import { getMediaAssetBlob } from '../../../composition/persistence/media-library/index.library.ts';
import { exportMediaHubBackup } from '../../../workflows/media-hub-backup';
import { translate } from '../../../platform/i18n';
import { isGalleryMediaItem } from '../items';
import type { GallerySelectionController } from './controller-types';
import { createMissingBlobError, type GalleryBusyAction } from './shared';
import { createSelectedBackupExportOptions } from './backup';

function getSelectedMediaItems(controller: GallerySelectionController) {
  return controller.state.selection.selectedItems.filter(isGalleryMediaItem);
}

export function createSelectionBackupAction(controller: GallerySelectionController) {
  return async (withBusy: GalleryBusyAction) => {
    const options = createSelectedBackupExportOptions(controller.state.selection.selectedItems);
    if (!options) return;

    await withBusy(async () => {
      await exportMediaHubBackup(options, {
        filename: `media-hub-selection-backup-${Date.now()}.zip`,
      });
    });
  };
}

export function createSelectionZipAction(controller: GallerySelectionController) {
  return async (withBusy: GalleryBusyAction) => {
    const mediaItems = getSelectedMediaItems(controller);
    if (mediaItems.length === 0) return;

    await withBusy(async () => {
      const sink = await createDirectFileSink({
        description: translate('gallery.app.selectionAssetsArchiveDescription'),
        extension: '.zip',
        filename: `media-hub-assets-${Date.now()}.zip`,
        mimeType: 'application/zip',
      });
      const archive = createArchiveWriter(sink);
      const paths = createArchivePathAllocator();

      try {
        for (const item of mediaItems) {
          const blob = await getMediaAssetBlob(item.entityId ?? item.id);
          const filename = item.originalFilename ?? item.filename;
          if (!blob) throw createMissingBlobError(filename);
          await archive.addBlob(paths.reserve([filename]), blob);
        }
        await archive.close();
      } catch (error) {
        await archive.abort(error);
        throw error;
      }
    });
  };
}
