import type { Ref } from 'react';
import { GalleryHeader } from '../../library/main-content/header';
import { GalleryMainContent } from '../../library/main-content';
import { GalleryOverlays } from './overlays';
import { GallerySidebar } from '../../library/sidebar';
import { GalleryImportProgressCard } from '../../library/import-progress-card';
import type { GalleryAppLayoutProps } from './types';
import { GALLERY_MEDIA_IMPORT_ACCEPT } from '../../library/media-import-profile';

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

function GalleryMediaImportInput(props: GalleryAppLayoutProps) {
  return (
    <input
      ref={props.mediaImportInputRef as Ref<HTMLInputElement>}
      type="file"
      accept={GALLERY_MEDIA_IMPORT_ACCEPT}
      multiple
      className="hidden"
      onChange={(event) => props.onMediaImportFileChange(Array.from(event.target.files ?? []))}
    />
  );
}

function GallerySidebarSection(props: GalleryAppLayoutProps) {
  const { state } = props;

  return (
    <GallerySidebar
      activeTags={state.filters.activeTags}
      allTags={state.derived.allTags}
      counts={state.derived.counts}
      facetFilters={state.filters.facetFilters}
      facets={state.derived.facets}
      folderFilter={state.filters.folderFilter}
      scope={state.filters.scope}
      onActiveTagsChange={props.onActiveTagsChange}
      onFacetFilterChange={props.onFacetFilterChange ?? (() => undefined)}
      onFolderFilterChange={props.onFolderFilterChange}
      onResetFilters={props.onResetFilters}
      onScopeChange={props.onScopeChange ?? (() => undefined)}
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
      scope={state.filters.scope}
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
      {...(props.onRecordingGroupOpen ? { onRecordingGroupOpen: props.onRecordingGroupOpen } : {})}
      onSearchChange={props.onSearchChange}
      onScopeChange={props.onScopeChange ?? (() => undefined)}
      onSelectionTagDraftChange={props.onSelectionTagDraftChange}
      onSelectionBackup={props.onSelectionBackup}
      onSelectionZip={props.onSelectionZip}
      onSortModeChange={props.onSortModeChange}
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
        'sniptale-extension-surface flex h-screen overflow-hidden bg-[var(--sniptale-color-surface-canvas)] p-4 ' +
        'text-[var(--sniptale-color-text-primary)]'
      }
    >
      <GalleryImportInput {...props} />
      <GalleryMediaImportInput {...props} />
      <GalleryOverlays {...props} />
      {props.state.storage.activeImport ? (
        <GalleryImportProgressCard
          state={props.state.storage.activeImport}
          onCancel={props.onActiveImportCancel}
          onDismiss={props.onActiveImportDismiss}
        />
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
        <GalleryHeader
          activeStorageBarClass={props.state.derived.activeStorageBarClass}
          allTags={props.state.derived.allTags}
          folderFilter={props.state.filters.folderFilter}
          isBusy={props.state.storage.isBusy}
          importTriggerRef={props.importTriggerRef}
          mediaImportTriggerRef={props.mediaImportTriggerRef}
          onApplySelectionTag={props.onApplySelectionTag}
          onClearSelection={props.onClearSelection}
          onDeleteMany={props.onDeleteMany}
          onDeleteAll={() => props.onDeleteMany(props.state.derived.allItems)}
          onExportBackup={props.onExportBackup}
          onSearchChange={props.onSearchChange}
          onImportBackupClick={props.onImportBackupClick}
          onImportMediaClick={props.onImportMediaClick}
          onSelectionTagDraftChange={props.onSelectionTagDraftChange}
          onSelectionBackup={props.onSelectionBackup}
          onSelectionZip={props.onSelectionZip}
          onSortModeChange={props.onSortModeChange}
          onViewModeChange={props.onViewModeChange}
          search={props.state.filters.search}
          selectedItems={props.state.selection.selectedItems}
          selectedSize={props.state.selection.selectedSize}
          selectionTagDraft={props.state.selection.selectionTagDraft}
          sortMode={props.state.filters.sortMode}
          storageInfo={props.state.storage.storageInfo}
          viewMode={props.viewMode}
        />
        <div className="flex min-h-0 min-w-0 flex-1 gap-4 overflow-hidden">
          <GallerySidebarSection {...props} />
          <GalleryMainSection {...props} />
        </div>
      </div>
    </div>
  );
}
