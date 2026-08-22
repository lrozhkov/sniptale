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
  isGalleryVideoProjectItem,
} from '../../library/items';

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
  onRefreshAll: () => void;
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
    inspectorCollapsed: Boolean(options?.inspectorCollapsed),
    item,
    url: null,
  });
}

function buildGalleryPreviewHandlers(
  actions: UseGalleryAppActionsResult,
  controller: GalleryAppStateController,
  messaging: Pick<RuntimeMessagingTransport, 'sendRuntimeMessage'>
) {
  return {
    onPreviewClose: () => void actions.preview.close(),
    onPreviewInspectorToggle: () =>
      controller.actions.preview.setPreview((previous) => ({
        ...previous,
        inspectorCollapsed: !previous.inspectorCollapsed,
      })),
    onPreviewResetChanges: () => actions.preview.resetChanges(),
    onPreviewDownload: actions.preview.download,
    onPreviewDownloadOriginal: actions.preview.downloadOriginal,
    onPreviewCopy: actions.preview.copy,
    onPreviewEdit: actions.preview.openInEditor,
    onPreviewOpenSnapshotScreenshot: actions.preview.openSnapshotScreenshotInEditor,
    onPreviewRestoreOriginal: actions.preview.restoreOriginal,
    onPreviewSaveCopy: actions.preview.saveCopy,
    onPreviewDelete: (
      item: Parameters<UseGalleryAppActionsResult['selection']['deleteMany']>[0][number]
    ) => void actions.selection.deleteMany([item]),
    onPreviewPromote: async (item: GalleryItem) => {
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
      openPreview(controller, item, options),
  };
}

function buildGallerySelectionHandlers(
  actions: UseGalleryAppActionsResult,
  controller: GalleryAppStateController
) {
  return {
    onSelectionTagDraftChange: controller.actions.selection.setSelectionTagDraft,
    onApplySelectionTag: () => void actions.selection.applyTag(),
    onSelectionZip: () => void actions.selection.downloadZip(),
    onDeleteMany: (items: Parameters<UseGalleryAppActionsResult['selection']['deleteMany']>[0]) =>
      void actions.selection.deleteMany(items),
    onClearSelection: () => controller.actions.selection.setSelectedIds(new Set()),
    onToggleSelection: controller.actions.selection.toggleSelection,
  };
}

function buildGalleryLayoutProps(props: GalleryAppBindingsProps) {
  const { actions, controller } = props;

  return {
    gridViewportRef: controller.refs.gridViewportRef,
    importInputRef: controller.refs.importInputRef,
    importTriggerRef: controller.refs.importTriggerRef,
    state: controller.state,
    viewMode: props.viewMode,
    onImportFileChange: (file: File | null) => void actions.importing.importSelectedFile(file),
    onActiveImportCancel: actions.importing.cancelActiveImport,
    onActiveImportDismiss: actions.importing.dismissActiveImport,
    onStorageManagerOpen: () => controller.actions.surface.setShowStorageManager(true),
    onStorageManagerClose: () => controller.actions.surface.setShowStorageManager(false),
    onConfirmDialogClose: () => controller.actions.surface.setConfirmDialog(null),
    onStorageCleanup: (group: Parameters<UseGalleryAppActionsResult['storage']['cleanup']>[0]) =>
      void actions.storage.cleanup(group),
    onPendingImportClose: actions.importing.closePendingImport,
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
    onRefresh: props.onRefreshAll,
    onBannerDismiss: () => controller.actions.surface.setBanner(null),
    onFilenameChange: controller.actions.preview.setFilenameDraft,
    onTagDraftChange: controller.actions.preview.setTagDraft,
    onRemoveTag: (tag: string) => removeTag(controller, tag),
    onAddTag: () => addTag(controller),
    onFolderFilterChange: controller.actions.filters.setFolderFilter,
    onScopeChange: controller.actions.filters.setScope,
    onActiveTagsChange: controller.actions.filters.setActiveTags,
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
