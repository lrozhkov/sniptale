import type { Dispatch, SetStateAction } from 'react';
import type { ScenarioProjectSummary } from '../../../features/scenario/contracts/types/project';
import type { GalleryAppStateController, GalleryViewMode } from '../../state/types';
import type { GalleryItem } from '../../library/items';
import type { UseGalleryAppActionsResult } from '../../library/actions/useGalleryAppActions.types';
import { GalleryAppLayout } from './layout';
import type { RuntimeMessagingTransport } from '../../../platform/runtime-messaging';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  isGalleryMediaItem,
  isGalleryScenarioExportItem,
  isGalleryScenarioItem,
  isGallerySelectableItem,
  isGalleryVideoProjectItem,
} from '../../library/items';
import type { GallerySavedView } from '../../../composition/persistence/gallery-saved-views';
import { translate } from '../../../platform/i18n';
import { openGalleryConfirmDialog } from '../../library/actions/shared';

function resolvePromotionTarget(item: GalleryItem) {
  if (isGalleryMediaItem(item)) return { kind: 'image' as const, id: item.entityId ?? item.id };
  if (isGalleryScenarioExportItem(item)) {
    return { kind: 'scenario' as const, id: item.project.id };
  }
  if (isGalleryScenarioItem(item)) return { kind: 'scenario' as const, id: item.entityId };
  if (isGalleryVideoProjectItem(item)) {
    return { kind: 'video-project' as const, id: item.entityId };
  }
  return null;
}

interface GalleryAppBindingsProps {
  actions: UseGalleryAppActionsResult;
  controller: GalleryAppStateController;
  messaging: Pick<RuntimeMessagingTransport, 'sendRuntimeMessage'>;
  filteredScenarioProjects?: ScenarioProjectSummary[];
  scenarioPreviewProject?: ScenarioProjectSummary | null;
  scenarioProjects?: ScenarioProjectSummary[];
  setScenarioPreviewProject?: Dispatch<SetStateAction<ScenarioProjectSummary | null>>;
  setViewMode: Dispatch<SetStateAction<GalleryViewMode>>;
  viewMode: GalleryViewMode;
}

function removeTag(controller: GalleryAppStateController, tag: string): void {
  controller.actions.preview.setTagDrafts((previous) => previous.filter((value) => value !== tag));
}

function addTag(controller: GalleryAppStateController, tag: string | null = null): void {
  const normalized = (tag ?? controller.state.preview.draft.tagInput).trim();
  if (!normalized || controller.state.preview.draft.tags.includes(normalized)) {
    return;
  }

  controller.actions.preview.setTagDrafts((previous) => [...previous, normalized]);
  controller.actions.preview.setTagDraft('');
}

function openPreview(
  controller: GalleryAppStateController,
  item: GalleryItem | null,
  options?: { inspectorCollapsed?: boolean }
) {
  controller.actions.preview.setPreview({
    inspectorCollapsed:
      options?.inspectorCollapsed ?? controller.state.preview.session.inspectorCollapsed,
    item,
    url: null,
  });
}

function isReadOnlyTrashPreview(controller: GalleryAppStateController): boolean {
  return Boolean(
    controller.state.filters.trashMode ||
    controller.state.preview.session.item?.lifecycle?.trashedAt !== undefined
  );
}

function buildGalleryPreviewHandlers(
  actions: UseGalleryAppActionsResult,
  controller: GalleryAppStateController,
  messaging: Pick<RuntimeMessagingTransport, 'sendRuntimeMessage'>
) {
  return {
    onPreviewClose: () => {
      if (isReadOnlyTrashPreview(controller)) {
        openPreview(controller, null, { inspectorCollapsed: false });
        return;
      }
      void actions.preview.close();
    },
    onPreviewInspectorToggle: () =>
      controller.actions.preview.setPreview((previous) => ({
        ...previous,
        inspectorCollapsed: !previous.inspectorCollapsed,
      })),
    onPreviewResetChanges: () => {
      if (!isReadOnlyTrashPreview(controller)) actions.preview.resetChanges();
    },
    onPreviewDownload: () =>
      isReadOnlyTrashPreview(controller) ? Promise.resolve(false) : actions.preview.download(),
    onPreviewDownloadOriginal: () =>
      isReadOnlyTrashPreview(controller)
        ? Promise.resolve(false)
        : actions.preview.downloadOriginal(),
    onPreviewCopy: () =>
      isReadOnlyTrashPreview(controller) ? Promise.resolve(false) : actions.preview.copy(),
    onPreviewEdit: (item: GalleryItem) => {
      if (!isReadOnlyTrashPreview(controller) && item.lifecycle?.trashedAt === undefined) {
        actions.preview.openInEditor(item);
      }
    },
    onProjectOpen: (item: GalleryItem) => {
      if (controller.state.filters.trashMode || item.lifecycle?.trashedAt !== undefined) return;
      actions.preview.openInEditor(item);
    },
    onRecordingGroupOpen: (item: GalleryItem) => {
      if (controller.state.filters.trashMode) {
        if (item.lifecycle?.trashedAt !== undefined)
          openPreview(controller, item, { inspectorCollapsed: false });
      } else if (item.lifecycle?.trashedAt === undefined) {
        void actions.preview.openInEditor(item);
      }
    },
    onPreviewOpenSnapshotScreenshot: () => {
      if (!isReadOnlyTrashPreview(controller)) actions.preview.openSnapshotScreenshotInEditor();
    },
    onPreviewRestoreOriginal: () => {
      if (!isReadOnlyTrashPreview(controller)) actions.preview.restoreOriginal();
    },
    onPreviewSaveCopy: () =>
      isReadOnlyTrashPreview(controller) ? Promise.resolve(false) : actions.preview.saveCopy(),
    onPreviewDelete: (
      item: Parameters<UseGalleryAppActionsResult['selection']['deleteMany']>[0][number]
    ) => {
      if (!isReadOnlyTrashPreview(controller) && item.lifecycle?.trashedAt === undefined) {
        void actions.selection.deleteMany([item]);
      }
    },
    onPreviewPromote: async (item: GalleryItem) => {
      if (isReadOnlyTrashPreview(controller) || item.lifecycle?.trashedAt !== undefined) return;
      const target = resolvePromotionTarget(item);
      if (!target) return;
      const response = await messaging.sendRuntimeMessage({
        aggregate: target,
        type: MessageType.PROMOTE_AGGREGATE_TO_LIBRARY,
      });
      if (!response.success) throw new Error(response.error ?? 'Could not save to the library.');
      controller.actions.preview.setPreview((previous) => ({ ...previous, item: null, url: null }));
      await controller.actions.storage.refresh();
    },
    onPreviewOpen: (item: GalleryItem, options?: { inspectorCollapsed?: boolean }) =>
      controller.state.filters.trashMode
        ? item.lifecycle?.trashedAt !== undefined
          ? openPreview(controller, item, { inspectorCollapsed: false })
          : undefined
        : item.lifecycle?.trashedAt === undefined
          ? openPreview(controller, item, options)
          : undefined,
    onPreviewNavigate: (item: GalleryItem) => {
      if (isReadOnlyTrashPreview(controller)) {
        if (item.lifecycle?.trashedAt !== undefined && controller.state.filters.trashMode) {
          openPreview(controller, item);
        }
        return;
      }
      if (item.lifecycle?.trashedAt === undefined) void actions.preview.navigate(item);
    },
    onPreviewRestoreTrash: async (item: GalleryItem) => {
      if (
        !controller.state.filters.trashMode ||
        item.lifecycle?.trashedAt === undefined ||
        controller.state.preview.session.item?.id !== item.id ||
        controller.state.storage.isBusy
      )
        return false;
      return (await actions.selection.restoreTrash?.([item])) ?? false;
    },
  };
}

function buildGallerySelectionHandlers(
  actions: UseGalleryAppActionsResult,
  controller: GalleryAppStateController
) {
  return {
    onSelectionTagDraftChange: controller.actions.selection.setSelectionTagDraft,
    onApplySelectionTag: (tag?: string) => {
      if (!controller.state.filters.trashMode) void actions.selection.applyTag(tag);
    },
    onSelectionBackup: () => {
      if (!controller.state.filters.trashMode) void actions.selection.downloadBackup();
    },
    onSelectionZip: () => {
      if (!controller.state.filters.trashMode) void actions.selection.downloadZip();
    },
    onDeleteMany: (items: Parameters<UseGalleryAppActionsResult['selection']['deleteMany']>[0]) =>
      void actions.selection.deleteMany(items),
    onClearSelection: () => controller.actions.selection.setSelectedIds(new Set()),
    onSelectAllFiltered: () =>
      controller.actions.selection.setSelectedIds(
        new Set(
          controller.state.derived.filteredItems
            .filter(isGallerySelectableItem)
            .map((item) => item.id)
        )
      ),
    onToggleSelection: controller.actions.selection.toggleSelection,
  };
}

function buildGalleryLayoutProps(props: GalleryAppBindingsProps) {
  const { actions, controller } = props;

  return {
    onTrashModeChange: (value: boolean) => {
      controller.actions.preview.setPreview({ inspectorCollapsed: false, item: null, url: null });
      controller.actions.filters.setTrashMode?.(value);
    },
    onRestoreTrash: () =>
      void actions.selection.restoreTrash?.(controller.state.selection.selectedItems),
    gridViewportRef: controller.refs.gridViewportRef,
    importInputRef: controller.refs.importInputRef,
    importTriggerRef: controller.refs.importTriggerRef,
    mediaImportInputRef: controller.refs.mediaImportInputRef,
    mediaImportTriggerRef: controller.refs.mediaImportTriggerRef,
    webSnapshotImportInputRef: controller.refs.webSnapshotImportInputRef,
    webSnapshotImportTriggerRef: controller.refs.webSnapshotImportTriggerRef,
    state: controller.state,
    viewMode: props.viewMode,
    onImportFileChange: (file: File | null) => void actions.importing.importSelectedFile(file),
    onMediaImportFileChange: (files: File[]) => void actions.importing.importMediaFiles(files),
    onImportFilesDrop: (files: File[]) => void actions.importing.importDroppedFiles(files),
    onWebSnapshotImportFileChange: (file: File | null) =>
      void actions.importing.inspectWebSnapshot(file),
    onActiveImportCancel: actions.importing.cancelActiveImport,
    onActiveImportDismiss: actions.importing.dismissActiveImport,
    onConfirmDialogClose: () => controller.actions.surface.setConfirmDialog(null),
    onPendingImportClose: actions.importing.closePendingImport,
    onPendingMediaImportClose: actions.importing.closePendingMediaImport,
    onPendingWebSnapshotImportClose: actions.importing.closePendingWebSnapshotImport,
    onWebSnapshotImportConfirm: actions.importing.confirmWebSnapshotImport,
    onMediaImportConfirm: (
      strategy: Parameters<UseGalleryAppActionsResult['importing']['confirmMediaFileImport']>[0]
    ) => void actions.importing.confirmMediaFileImport(strategy),
    onPendingExportClose: actions.backup.closePendingExport,
    onBackupExportConfirm: (
      options: Parameters<UseGalleryAppActionsResult['backup']['confirmExport']>[0]
    ) => void actions.backup.confirmExport(options),
    onBackupExportInspect: (
      options: Parameters<UseGalleryAppActionsResult['backup']['inspectExport']>[0]
    ) => actions.backup.inspectExport(options),
    onImport: (strategy: Parameters<UseGalleryAppActionsResult['importing']['importBackup']>[0]) =>
      void actions.importing.importBackup(strategy),
    onExportBackup: () => void actions.backup.exportBackup(),
    onImportBackupClick: () => controller.refs.importInputRef.current?.click(),
    onImportMediaClick: () => controller.refs.mediaImportInputRef.current?.click(),
    onImportWebSnapshotClick: () => controller.refs.webSnapshotImportInputRef.current?.click(),
    onBannerDismiss: () => controller.actions.surface.setBanner(null),
    onFilenameChange: (
      value: Parameters<typeof controller.actions.preview.setFilenameDraft>[0]
    ) => {
      if (!isReadOnlyTrashPreview(controller)) controller.actions.preview.setFilenameDraft(value);
    },
    onTagDraftChange: (value: Parameters<typeof controller.actions.preview.setTagDraft>[0]) => {
      if (!isReadOnlyTrashPreview(controller)) controller.actions.preview.setTagDraft(value);
    },
    onRemoveTag: (tag: string) => {
      if (!isReadOnlyTrashPreview(controller)) removeTag(controller, tag);
    },
    onAddTag: (tag?: string) => {
      if (!isReadOnlyTrashPreview(controller)) addTag(controller, tag ?? null);
    },
    onFolderFilterChange: controller.actions.filters.setFolderFilter,
    onScopeChange: controller.actions.filters.setScope,
    onActiveTagsChange: controller.actions.filters.setActiveTags,
    onFacetFilterChange: controller.actions.filters.setFacetFilter,
    onCreateSavedView: controller.actions.filters.createSavedView,
    onDeleteSavedView: (view: GallerySavedView) =>
      openGalleryConfirmDialog(controller, {
        title: translate('gallery.app.savedViewDeleteTitle'),
        message: translate('gallery.app.savedViewDeleteMessage').replace('{name}', view.name),
        onConfirm: async () => {
          try {
            await controller.actions.filters.deleteSavedView(view.id);
          } catch (error) {
            controller.actions.surface.setBanner(translate('gallery.app.savedViewDeleteFailed'));
            throw error;
          }
        },
      }),
    onMoveSavedView: (id: string, direction: 'down' | 'up') =>
      void controller.actions.filters.moveSavedView(id, direction).catch(() => {
        controller.actions.surface.setBanner(translate('gallery.app.savedViewReorderFailed'));
      }),
    onResetFilters: controller.actions.filters.resetFilters,
    onSavedViewSelect: controller.actions.filters.selectSavedView,
    onUpdateSavedView: controller.actions.filters.updateSavedView,
    onSearchChange: controller.actions.filters.setSearch,
    onSortModeChange: controller.actions.filters.setSortMode,
    onViewModeChange: props.setViewMode,
    ...buildGalleryPreviewHandlers(actions, controller, props.messaging),
    ...buildGallerySelectionHandlers(actions, controller),
  };
}

export function GalleryAppBindings(props: GalleryAppBindingsProps) {
  return <GalleryAppLayout {...buildGalleryLayoutProps(props)} />;
}
