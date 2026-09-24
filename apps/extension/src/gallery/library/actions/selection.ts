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
import {
  listMediaAssetProjectUsage,
  type MediaAssetProjectUsage,
} from '../../../composition/persistence/media-library/usage';

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

    const { media, scenarios, videoProjects } = splitSelectableTargets(selectableTargets);
    let expectedUsageById = new Map<string, readonly MediaAssetProjectUsage[]>();
    let usageLoaded = false;
    await withBusy(async () => {
      expectedUsageById = new Map(
        await Promise.all(
          media.map(async (item) => {
            const id = item.entityId ?? item.id;
            return [id, await listMediaAssetProjectUsage(id)] as const;
          })
        )
      );
      usageLoaded = true;
    });
    if (!usageLoaded) return;
    const affectedById = new Map<string, MediaAssetProjectUsage>();
    for (const project of [...expectedUsageById.values()].flat()) {
      const key = `${project.kind}:${project.id}`;
      affectedById.set(key, {
        ...project,
        primary: project.primary || (affectedById.get(key)?.primary ?? false),
      });
    }
    const affectedProjects = [...affectedById.values()];
    const primaryProjects = affectedProjects.filter((project) => project.primary);
    if (primaryProjects.length > 0) {
      const projectNames = primaryProjects.map((project) => project.name).join(', ');
      openGalleryConfirmDialog(controller, {
        title: translate('gallery.app.deleteBlockedTitle'),
        message: `${translate('gallery.app.deleteBlockedPrimary')} ${projectNames}`,
        confirmText: translate('common.actions.close'),
        onConfirm: async () => undefined,
      });
      return;
    }
    const affectedNames = affectedProjects.map((project) => project.name).join(', ');
    const warning =
      affectedProjects.length > 0
        ? [
            translate('gallery.app.deleteAffectsProjects'),
            `${affectedNames}.`,
            translate('gallery.app.deleteHistoryWarning'),
          ].join(' ')
        : '';
    openGalleryConfirmDialog(controller, {
      title: translate('gallery.app.deleteConfirmTitle'),
      message: `${translate('gallery.app.deleteSelectedConfirm')} ${warning}`.trim(),
      onConfirm: async () => {
        await withBusy(async () => {
          if (media.length > 0)
            await deleteMediaLibraryAssetsBatchSafely(
              media.map((item) => item.entityId ?? item.id),
              expectedUsageById
            );
          for (const item of scenarios) await deleteScenarioProjectRecord(item.entityId);
          for (const item of videoProjects) await deletePersistedVideoProject(item.entityId);

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
