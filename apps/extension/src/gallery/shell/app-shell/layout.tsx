import type { Ref } from 'react';
import { GalleryHeader } from '../../library/main-content/header';
import { GalleryMainContent } from '../../library/main-content';
import { GalleryOverlays } from './overlays';
import { GallerySidebar } from '../../library/sidebar';
import type { GalleryAppLayoutProps } from './types';

function GalleryImportInput(props: GalleryAppLayoutProps) {
  return (
    <input
      ref={props.importInputRef as Ref<HTMLInputElement>}
      type="file"
      accept=".zip,application/zip"
      className="hidden"
      onChange={(event) => props.onImportFileChange(event.target.files?.[0] ?? null)}
    />
  );
}

function GallerySidebarSection(props: GalleryAppLayoutProps) {
  const { state } = props;

  return (
    <GallerySidebar
      activeStorageBarClass={state.derived.activeStorageBarClass}
      activeTags={state.filters.activeTags}
      allTags={state.derived.allTags}
      counts={state.derived.counts}
      folderFilter={state.filters.folderFilter}
      isBusy={state.storage.isBusy}
      onActiveTagsChange={props.onActiveTagsChange}
      onExportBackup={props.onExportBackup}
      onFolderFilterChange={props.onFolderFilterChange}
      onImportBackupClick={props.onImportBackupClick}
      onStorageManagerOpen={props.onStorageManagerOpen}
      storageInfo={
        state.storage.storageInfo
          ? {
              usage: state.storage.storageInfo.usage,
              ...(typeof state.storage.storageInfo.quota === 'undefined'
                ? {}
                : { quota: state.storage.storageInfo.quota }),
              ...(typeof state.storage.storageInfo.usageRatio === 'undefined'
                ? {}
                : { usageRatio: state.storage.storageInfo.usageRatio }),
              ...(state.storage.storageInfo.isPersistent == null
                ? {}
                : { isPersistent: state.storage.storageInfo.isPersistent }),
            }
          : null
      }
    />
  );
}

function GalleryMainSection(props: GalleryAppLayoutProps) {
  const { gridViewportRef, state } = props;

  return (
    <GalleryMainContent
      allTags={state.derived.allTags}
      banner={state.storage.banner}
      filteredItems={state.derived.filteredItems}
      folderFilter={state.filters.folderFilter}
      gridMetrics={state.derived.gridMetrics}
      gridWidth={state.derived.gridWidth}
      gridViewportRef={gridViewportRef}
      isLoading={state.storage.isLoading}
      search={state.filters.search}
      selectedIds={state.selection.selectedIds}
      selectedItems={state.selection.selectedItems}
      selectedSize={state.selection.selectedSize}
      selectionTagDraft={state.selection.selectionTagDraft}
      sortMode={state.filters.sortMode}
      visibleItems={state.derived.visibleItems}
      viewMode={props.viewMode}
      onApplySelectionTag={props.onApplySelectionTag}
      onBannerDismiss={props.onBannerDismiss}
      onClearSelection={props.onClearSelection}
      onDeleteMany={props.onDeleteMany}
      onPreviewOpen={props.onPreviewOpen}
      onRefresh={props.onRefresh}
      onSearchChange={props.onSearchChange}
      onSelectionTagDraftChange={props.onSelectionTagDraftChange}
      onSelectionZip={props.onSelectionZip}
      onSortModeChange={props.onSortModeChange}
      onStorageManagerOpen={props.onStorageManagerOpen}
      onToggleSelection={props.onToggleSelection}
      onViewModeChange={props.onViewModeChange}
    />
  );
}

export function GalleryAppLayout(props: GalleryAppLayoutProps) {
  return (
    <div
      data-ui="gallery.page.root"
      className={
        'sniptale-extension-surface flex h-screen overflow-hidden bg-[var(--sniptale-color-surface-canvas)] ' +
        'text-[var(--sniptale-color-text-primary)]'
      }
    >
      <GalleryImportInput {...props} />
      <GalleryOverlays {...props} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <GalleryHeader
          folderFilter={props.state.filters.folderFilter}
          isLoading={props.state.storage.isLoading}
          onRefresh={props.onRefresh}
          onSearchChange={props.onSearchChange}
          onSortModeChange={props.onSortModeChange}
          onViewModeChange={props.onViewModeChange}
          search={props.state.filters.search}
          sortMode={props.state.filters.sortMode}
          viewMode={props.viewMode}
        />
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <GallerySidebarSection {...props} />
          <GalleryMainSection {...props} />
        </div>
      </div>
    </div>
  );
}
