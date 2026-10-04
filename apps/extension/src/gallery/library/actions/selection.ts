import { addMediaLibraryEntryTagsSafely } from '../../../workflows/media-hub/store';
import { translate } from '../../../platform/i18n';
import { updateScenarioProjectRecordMetadata } from '../../../composition/persistence/scenario/store/public';
import type { GallerySelectionController } from './controller-types';
import {
  isGalleryMediaItem,
  isGalleryScenarioExportItem,
  isGalleryScenarioItem,
  isGallerySelectableItem,
  isGalleryVideoProjectItem,
  type GalleryItem,
} from '../items';
import {
  moveLibraryItemsToTrash,
  restoreLibraryTrashItems,
  permanentlyDeleteLibraryItem,
} from '../../../workflows/media-hub/trash';
import type { LibraryTrashTarget } from '../../../composition/persistence/library-lifecycle/trash';
import { type GalleryBusyAction, createGalleryUserFacingActionError } from './shared';
import {
  getGalleryDeletionContextKey,
  type GalleryDeletionOpening,
  type GalleryPreparedDeletion,
  type GalleryDeletionRequest,
} from '../deletion/types';
import { listMediaAssetProjectUsageBatch } from '../../../composition/persistence/media-library/usage';

function splitSelectableTargets(targets: GalleryItem[]) {
  return {
    media: targets.filter(isGalleryMediaItem),
    scenarios: targets.filter(isGalleryScenarioItem),
    videoProjects: targets.filter(isGalleryVideoProjectItem),
    exports: targets.filter(isGalleryScenarioExportItem),
  };
}

function trashTarget(item: GalleryItem): LibraryTrashTarget {
  if (isGalleryScenarioExportItem(item)) return { kind: 'scenario-export', id: item.entityId };
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
  return async (targets: GalleryItem[], withBusy: GalleryBusyAction): Promise<boolean> => {
    const restoreTargets = [
      ...new Map(
        targets
          .filter((item) => isGallerySelectableItem(item) || isGalleryScenarioExportItem(item))
          .map((item) => {
            const target = trashTarget(item);
            return [`${target.kind}:${target.id}`, target] as const;
          })
      ).values(),
    ];
    if (restoreTargets.length === 0) return false;
    let restored = false;
    await withBusy(async () => {
      await restoreLibraryTrashItems(restoreTargets);
      restored = true;
      await finishTrashAction(controller);
    });
    return restored;
  };
}

async function preparePermanentDeletion(
  controller: GallerySelectionController,
  targets: readonly GalleryItem[],
  withBusy: GalleryBusyAction,
  isCurrent: () => boolean
): Promise<GalleryPreparedDeletion | null> {
  const { media, scenarios, videoProjects, exports } = splitSelectableTargets([...targets]);
  const scenarioIds = new Set(scenarios.map((item) => item.entityId));
  const independentExports = exports.filter((item) => !scenarioIds.has(item.project.id));
  const removedProjectKeys = new Set([
    ...scenarios.map((item) => `scenario:${item.entityId}`),
    ...videoProjects.map((item) => `video:${item.entityId}`),
  ]);
  let prepared: GalleryPreparedDeletion | null = null;
  await withBusy(
    async () => {
      const usageById = await listMediaAssetProjectUsageBatch(
        media.map((item) => item.entityId ?? item.id)
      );
      const expectedUsageById = new Map(
        [...usageById].map(([id, usage]) => [
          id,
          usage.filter((project) => !removedProjectKeys.has(`${project.kind}:${project.id}`)),
        ])
      );
      if (!isCurrent()) return;
      const affectedProjects = [
        ...new Map(
          [...expectedUsageById.values()]
            .flat()
            .map((project) => [`${project.kind}:${project.id}`, project])
        ).values(),
      ];
      const primaryProjects = [...expectedUsageById.values()]
        .flat()
        .filter((project) => project.primary);
      if (primaryProjects.length > 0)
        throw createGalleryUserFacingActionError(
          [
            translate('gallery.app.deleteBlockedPrimary'),
            `${primaryProjects.map((project) => project.name).join(', ')}.`,
            translate('gallery.app.deletePrimaryNextStep'),
          ].join(' ')
        );
      const warning =
        affectedProjects.length > 0
          ? [
              translate('gallery.app.deleteAffectsProjects'),
              `${affectedProjects.map((project) => project.name).join(', ')}.`,
              translate('gallery.app.deleteHistoryWarning'),
            ].join(' ')
          : '';
      prepared = {
        warning: `${translate('gallery.app.permanentDeleteConfirm')} ${warning}`.trim(),
        confirm: async () => {
          if (!isCurrent()) return false;
          let deleted = false;
          await withBusy(
            async () => {
              try {
                for (const item of [
                  ...independentExports,
                  ...scenarios,
                  ...videoProjects,
                  ...media,
                ]) {
                  await permanentlyDeleteLibraryItem(
                    {
                      target: trashTarget(item),
                      lifecycle: {
                        updatedAt: item.lifecycle?.updatedAt ?? item.updatedAt,
                        ...(item.lifecycle?.trashedAt !== undefined
                          ? { trashedAt: item.lifecycle.trashedAt }
                          : {}),
                      },
                    },
                    expectedUsageById.get(item.entityId ?? item.id)
                  );
                }
                deleted = true;
              } finally {
                await finishTrashAction(controller);
              }
            },
            {
              stage: 'permanent-delete',
              materialType: targets.length === 1 ? trashTarget(targets[0]!).kind : 'mixed',
            }
          );
          return deleted;
        },
      };
    },
    {
      stage: 'prepare-delete',
      materialType: targets.length === 1 ? trashTarget(targets[0]!).kind : 'mixed',
    }
  );
  return prepared;
}

export function createDeleteManyAction(
  controller: GallerySelectionController,
  readController: () => GallerySelectionController = () => controller
) {
  return async (
    targets: GalleryItem[],
    withBusy: GalleryBusyAction,
    opening?: GalleryDeletionOpening
  ) => {
    const selectable = [
      ...new Map(
        targets
          .filter(isGallerySelectableItem)
          .map((item) => [
            item.id,
            { ...item, ...(item.lifecycle ? { lifecycle: { ...item.lifecycle } } : {}) },
          ])
      ).values(),
    ];
    if (selectable.length === 0) return;
    const contextKey = getGalleryDeletionContextKey(
      controller.state.selection.selectedItems,
      controller.state.preview.session.item
    );
    const isCurrent = () => {
      const current = readController().state;
      return (
        current.storage.deletionRequest === request &&
        contextKey ===
          getGalleryDeletionContextKey(
            current.selection.selectedItems,
            current.preview.session.item
          )
      );
    };
    const request: GalleryDeletionRequest = {
      anchor: opening?.anchor ?? null,
      keyboard: opening?.keyboard ?? false,
      contextKey,
      targets: selectable,
      moveToTrash: selectable.some((item) => item.lifecycle?.trashedAt === undefined)
        ? async () => {
            if (!isCurrent()) return false;
            let moved = false;
            await withBusy(async () => {
              await moveLibraryItemsToTrash(selectable.map(trashTarget));
              moved = true;
              await finishTrashAction(controller);
            });
            return moved;
          }
        : null,
      preparePermanent: () =>
        isCurrent()
          ? preparePermanentDeletion(controller, selectable, withBusy, isCurrent)
          : Promise.resolve(null),
    };
    controller.actions.surface.setDeletionRequest(request);
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
