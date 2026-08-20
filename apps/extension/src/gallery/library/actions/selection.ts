import {
  addMediaLibraryEntryTagsSafely,
  deleteMediaLibraryAssetsBatchSafely,
  deleteStorageCleanupCandidatesSafely,
} from '../../../workflows/media-hub/store';
import type { StorageCleanupGroup } from '../../../features/media-hub/types';
import { translate } from '../../../platform/i18n';
import {
  deleteScenarioProjectRecord,
  updateScenarioProjectRecordMetadata,
} from '../../../composition/persistence/scenario/store/public';
import { formatBytes } from '../../../platform/i18n/format-bytes';
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
import { exportMediaHubBackup } from '../../../workflows/media-hub-backup';

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
      message:
        `${translate('gallery.app.deleteManyPrefix')} ` +
        `${selectableTargets.length} ${translate('gallery.app.deleteManySuffix')}`,
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

export function createStorageCleanupAction(controller: GallerySelectionController) {
  return async (group: StorageCleanupGroup, withBusy: GalleryBusyAction) => {
    if (group.items.length === 0) {
      return;
    }

    openGalleryConfirmDialog(controller, {
      message:
        `${group.title}: ${translate('gallery.app.storageCleanupDeletePrefix')} ` +
        `${group.items.length} ${translate('gallery.app.storageCleanupDeleteMiddle')} ` +
        `${formatBytes(group.potentialBytes, 2)}${translate('gallery.app.storageCleanupDeleteSuffix')} ` +
        `${group.irreversibleLabel}.`,
      onConfirm: async () => {
        await withBusy(async () => {
          await deleteStorageCleanupCandidatesSafely(group.items);
          await controller.actions.storage.refresh();
        });
      },
    });
  };
}

export function createSelectionZipAction(controller: GallerySelectionController) {
  return async (withBusy: GalleryBusyAction) => {
    const mediaItems = controller.state.selection.selectedItems.filter(isGalleryMediaItem);
    if (mediaItems.length === 0) {
      return;
    }
    await withBusy(async () => {
      await exportMediaHubBackup(
        {
          includeSourceMetadata: true,
          includeTelemetry: true,
          includeWebSnapshots: true,
          scope: 'selected',
          selected: {
            mediaAssetIds: mediaItems.map((item) => item.entityId ?? item.id),
            scenarioProjectIds: [],
            videoProjectIds: [],
          },
        },
        { filename: `media-hub-selection-${Date.now()}.zip` }
      );
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
  return async (withBusy: GalleryBusyAction) => {
    const normalizedTag = controller.state.selection.selectionTagDraft.trim();
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
