import type { Dispatch, SetStateAction } from 'react';
import type { ScenarioProjectSummary } from '../../../features/scenario/contracts/types/project';
import type { GalleryViewMode } from '../app/types';
import type { GalleryItem } from '../../library/items';
import type { UseGalleryAppActionsResult } from '../../library/actions/useGalleryAppActions.types';
import type { GalleryAppStateController } from '../app/types';
import { GalleryAppLayout } from './layout';

interface GalleryAppBindingsProps {
  actions: UseGalleryAppActionsResult;
  controller: GalleryAppStateController;
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
  controller: GalleryAppStateController
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
    onPreviewCopy: actions.preview.copy,
    onPreviewEdit: actions.preview.openInEditor,
    onPreviewOpenSnapshotScreenshot: actions.preview.openSnapshotScreenshotInEditor,
    onPreviewDelete: (
      item: Parameters<UseGalleryAppActionsResult['selection']['deleteMany']>[0][number]
    ) => void actions.selection.deleteMany([item]),
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
    state: controller.state,
    viewMode: props.viewMode,
    onImportFileChange: (file: File | null) => void actions.importing.importSelectedFile(file),
    onStorageManagerOpen: () => controller.actions.surface.setShowStorageManager(true),
    onStorageManagerClose: () => controller.actions.surface.setShowStorageManager(false),
    onConfirmDialogClose: () => controller.actions.surface.setConfirmDialog(null),
    onStorageCleanup: (group: Parameters<UseGalleryAppActionsResult['storage']['cleanup']>[0]) =>
      void actions.storage.cleanup(group),
    onPendingImportClose: () => controller.actions.surface.setPendingImport(null),
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
    onActiveTagsChange: controller.actions.filters.setActiveTags,
    onSearchChange: controller.actions.filters.setSearch,
    onSortModeChange: controller.actions.filters.setSortMode,
    onViewModeChange: props.setViewMode,
    ...buildGalleryPreviewHandlers(actions, controller),
    ...buildGallerySelectionHandlers(actions, controller),
  };
}

export function GalleryAppBindings(props: GalleryAppBindingsProps) {
  return <GalleryAppLayout {...buildGalleryLayoutProps(props)} />;
}
