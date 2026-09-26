import { addMediaLibraryEntryTagsSafely } from '../../../workflows/media-hub/store';
import { translate } from '../../../platform/i18n';
import { updateScenarioProjectRecordMetadata } from '../../../composition/persistence/scenario/store/public';
import type { GallerySelectionController } from './controller-types';
import {
  isGalleryMediaItem,
  isGalleryScenarioItem,
  isGallerySelectableItem,
  isGalleryVideoProjectItem,
  type GalleryItem,
} from '../items';
import {
  moveLibraryItemsToTrash,
  restoreLibraryTrashItems,
  permanentlyDeleteTrashItem,
} from '../../../workflows/media-hub/trash';
import type { LibraryLifecycleTarget } from '../../../composition/persistence/library-lifecycle';
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

function trashTarget(item: GalleryItem): LibraryLifecycleTarget {
  if (isGalleryScenarioItem(item)) return { kind: 'scenario-project', id: item.entityId };
  if (isGalleryVideoProjectItem(item)) return { kind: 'video-project', id: item.entityId };
  return { kind: 'media', id: item.entityId ?? item.id };
}

async function finishTrashAction(controller: GallerySelectionController) {
  controller.actions.selection.setSelectedIds(new Set());
  controller.actions.preview.setPreview({ inspectorCollapsed: false, item: null, url: null });
  await controller.actions.storage.refresh();
}

export function createRestoreTrashAction(controller: GallerySelectionController) {
  return (targets: GalleryItem[], withBusy: GalleryBusyAction) =>
    withBusy(async () => {
      await restoreLibraryTrashItems(targets.filter(isGallerySelectableItem).map(trashTarget));
      await finishTrashAction(controller);
    });
}

export function createDeleteManyAction(controller: GallerySelectionController) {
  return async (targets: GalleryItem[], withBusy: GalleryBusyAction) => {
    const selectableTargets = targets.filter(isGallerySelectableItem);
    if (selectableTargets.length === 0) {
      return;
    }

    if (selectableTargets.every((item) => item.lifecycle?.trashedAt === undefined)) {
      openGalleryConfirmDialog(controller, {
        title: translate('gallery.app.moveToTrash'),
        message: translate('gallery.app.moveToTrashConfirm'),
        confirmText: translate('gallery.app.moveToTrash'),
        onConfirm: () =>
          withBusy(async () => {
            await moveLibraryItemsToTrash(selectableTargets.map(trashTarget));
            await finishTrashAction(controller);
          }),
      });
      return;
    }
    const trashItems = selectableTargets.filter((item) => item.lifecycle?.trashedAt !== undefined);
    const { media, scenarios, videoProjects } = splitSelectableTargets(trashItems);
    const removedProjectKeys = new Set([
      ...scenarios.map((item) => `scenario:${item.entityId}`),
      ...videoProjects.map((item) => `video:${item.entityId}`),
    ]);
    let expectedUsageById = new Map<string, readonly MediaAssetProjectUsage[]>();
    let usageLoaded = false;
    await withBusy(async () => {
      expectedUsageById = new Map(
        await Promise.all(
          media.map(async (item) => {
            const id = item.entityId ?? item.id;
            const remainingUsage = (await listMediaAssetProjectUsage(id)).filter(
              (usage) => !removedProjectKeys.has(`${usage.kind}:${usage.id}`)
            );
            return [id, remainingUsage] as const;
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
      title: translate('gallery.app.permanentDelete'),
      confirmText: translate('gallery.app.permanentDelete'),
      message: `${translate('gallery.app.permanentDeleteConfirm')} ${warning}`.trim(),
      onConfirm: async () => {
        await withBusy(async () => {
          try {
            // Remove only confirmed project roots first, then revalidate remaining media usage.
            for (const item of [...scenarios, ...videoProjects, ...media]) {
              await permanentlyDeleteTrashItem(
                { target: trashTarget(item), trashedAt: item.lifecycle!.trashedAt! },
                expectedUsageById.get(item.entityId ?? item.id)
              );
            }
          } finally {
            await finishTrashAction(controller);
          }
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
