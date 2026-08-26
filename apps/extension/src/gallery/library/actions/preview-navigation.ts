import type { GalleryItem } from '../items';
import type { GalleryPreviewController } from './controller-types';
import { createSaveMetadataAction } from './preview';
import type { GalleryBusyAction } from './shared';

export function createNavigatePreviewAction(controller: GalleryPreviewController) {
  return async (target: GalleryItem, withBusy: GalleryBusyAction) => {
    await withBusy(async () => {
      await createSaveMetadataAction(controller)(async (action) => action());
      controller.actions.preview.setPreview((current) => ({
        inspectorCollapsed: current.inspectorCollapsed,
        item: target,
        url: null,
      }));
    });
  };
}
