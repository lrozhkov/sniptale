import {
  addMediaLibraryEntryTagsSafely,
  deleteMediaLibraryAssetsBatchSafely,
} from '../../../workflows/media-hub/store';
import { translate } from '../../../platform/i18n';
import {
  deleteScenarioProjectRecord,
  updateScenarioProjectRecordMetadata,
} from '../../../composition/persistence/scenario/store/public';
import type { GallerySelectionController } from './controller-types';
import {
  isGalleryMediaItem,
  isGalleryScenarioItem,
  isGallerySelectableItem,
  isGalleryVideoProjectItem,
  type GalleryItem,
} from '../items';
import { deletePersistedVideoProject } from '../../../workflows/media-hub/video-projects';
import { type GalleryBusyAction, openGalleryConfirmDialog } from './shared';

function splitSelectableTargets(targets: GalleryItem[]) {
  return {
    media: targets.filter(isGalleryMediaItem),
    scenarios: targets.filter(isGalleryScenarioItem),
    videoProjects: targets.filter(isGalleryVideoProjectItem),
  };
}

export function createDeleteManyAction(controller: GallerySelectionController) {
  return async (targets: GalleryItem[], withBusy: GalleryBusyAction) => {
    const selectableTargets = targets.filter(isGallerySelectableItem);
    if (selectableTargets.length === 0) {
      return;
    }

    openGalleryConfirmDialog(controller, {
      title: translate('gallery.app.deleteConfirmTitle'),
      message: translate('gallery.app.deleteSelectedConfirm'),
      onConfirm: async () => {
        await withBusy(async () => {
          const { media, scenarios, videoProjects } = splitSelectableTargets(selectableTargets);

          await Promise.all([
            media.length > 0
              ? deleteMediaLibraryAssetsBatchSafely(media.map((item) => item.entityId ?? item.id))
              : Promise.resolve(),
            ...scenarios.map((item) => deleteScenarioProjectRecord(item.entityId)),
            ...videoProjects.map((item) => deletePersistedVideoProject(item.entityId)),
          ]);

          controller.actions.selection.setSelectedIds(new Set());
          controller.actions.preview.setPreview({
            inspectorCollapsed: false,
            item: null,
            url: null,
          });
          await controller.actions.storage.refresh();
        });
      },
    });
  };
}

function getItemsMissingSelectionTag(
  controller: GallerySelectionController,
  normalizedTag: string
) {
  return controller.state.selection.selectedItems.filter((item) => {
    return (
      (isGalleryMediaItem(item) || isGalleryScenarioItem(item)) &&
      !item.tags.includes(normalizedTag)
    );
  });
}

export function createApplySelectionTagAction(controller: GallerySelectionController) {
  return async (withBusy: GalleryBusyAction, tag?: string) => {
    const normalizedTag = (tag ?? controller.state.selection.selectionTagDraft).trim();
    const targets = getItemsMissingSelectionTag(controller, normalizedTag);
    if (!normalizedTag || targets.length === 0) {
      return;
    }

    await withBusy(async () => {
      await Promise.all(
        targets.map((item) => {
          if (isGalleryMediaItem(item)) {
            return addMediaLibraryEntryTagsSafely(item.entityId ?? item.id, [normalizedTag]);
          }

          const nextTags = [...item.tags, normalizedTag];
          return updateScenarioProjectRecordMetadata(item.entityId, {
            tags: nextTags,
          });
        })
      );

      controller.actions.selection.setSelectionTagDraft('');
      await controller.actions.storage.refresh();
    });
  };
}
