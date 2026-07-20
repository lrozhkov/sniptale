import { useEffect, useRef } from 'react';
import type { GalleryAppStateController, GalleryViewMode } from './types';
import { isGalleryMediaItem, isGallerySelectableItem, type GalleryItem } from '../library/items';
import { useGalleryFilterState } from './useGalleryFilterState';
import { useGalleryPreviewState } from '../library/preview/useGalleryPreviewState';
import { useGalleryViewportState } from './useGalleryViewportState';
import { useGalleryDerivedState } from './derived';
import { useGalleryStorageWorkflow } from './storage-workflow';

type GalleryFiltersState = ReturnType<typeof useGalleryFilterState>;
type GalleryPreviewState = ReturnType<typeof useGalleryPreviewState>;
type GalleryStorageWorkflow = ReturnType<typeof useGalleryStorageWorkflow>;

function toggleSelectedGalleryItem(
  setSelectedIds: GalleryFiltersState['actions']['setSelectedIds'],
  filteredItems: GalleryItem[],
  selectionAnchorRef: { current: string | null },
  assetId: string,
  shiftKey = false
) {
  const selectableIds = filteredItems.filter(isGallerySelectableItem).map((item) => item.id);

  if (shiftKey && selectionAnchorRef.current) {
    const rangeStart = selectableIds.indexOf(selectionAnchorRef.current);
    const rangeEnd = selectableIds.indexOf(assetId);

    if (rangeStart !== -1 && rangeEnd !== -1) {
      const [from, to] = rangeStart < rangeEnd ? [rangeStart, rangeEnd] : [rangeEnd, rangeStart];
      const rangeIds = selectableIds.slice(from, to + 1);

      setSelectedIds((previous) => new Set([...previous, ...rangeIds]));
      selectionAnchorRef.current = assetId;
      return;
    }
  }

  setSelectedIds((previous) => {
    const next = new Set(previous);
    if (next.has(assetId)) {
      next.delete(assetId);
    } else {
      next.add(assetId);
    }
    return next;
  });
  selectionAnchorRef.current = assetId;
}

function buildGalleryAppState(props: {
  derived: ReturnType<typeof useGalleryDerivedState>;
  filters: GalleryFiltersState;
  preview: GalleryPreviewState;
  storage: GalleryStorageWorkflow['state'];
  viewport: ReturnType<typeof useGalleryViewportState>;
}) {
  return {
    derived: buildGalleryDerivedViewState(props.derived, props.viewport),
    filters: buildGalleryFilterViewState(props.filters),
    preview: buildGalleryPreviewViewState(props.preview),
    selection: buildGallerySelectionViewState(props.derived, props.filters),
    storage: props.storage,
  };
}

function buildGalleryFilterViewState(filters: GalleryFiltersState) {
  return {
    activeTags: filters.state.activeTags,
    folderFilter: filters.state.folderFilter,
    search: filters.state.search,
    sortMode: filters.state.sortMode,
  };
}

function buildGalleryPreviewViewState(preview: GalleryPreviewState) {
  return {
    draft: {
      filename: preview.state.draft.filename,
      hasChanges: preview.state.draft.hasChanges,
      tagInput: preview.state.draft.tagInput,
      tags: preview.state.draft.tags,
    },
    session: preview.state.session,
  };
}

function buildGallerySelectionViewState(
  derived: ReturnType<typeof useGalleryDerivedState>,
  filters: GalleryFiltersState
) {
  return {
    selectedIds: filters.state.selectedIds,
    selectedItems: derived.selectedItems,
    selectedSize: derived.selectedSize,
    selectionTagDraft: filters.state.selectionTagDraft,
  };
}

function buildGalleryDerivedViewState(
  derived: ReturnType<typeof useGalleryDerivedState>,
  viewport: ReturnType<typeof useGalleryViewportState>
) {
  return {
    activeStorageBarClass: derived.activeStorageBarClass,
    allTags: derived.allTags,
    counts: derived.counts,
    filteredItems: derived.filteredItems,
    gridMetrics: {
      columnCount: derived.gridMetrics.columnCount,
      startRow: derived.gridMetrics.startRow,
      totalRows: derived.gridMetrics.totalRows,
    },
    gridWidth: viewport.gridWidth,
    visibleItems: derived.gridMetrics.visibleItems,
  };
}

function buildGalleryAppActions(args: {
  derived: ReturnType<typeof useGalleryDerivedState>;
  filters: GalleryFiltersState;
  preview: GalleryPreviewState;
  selectionAnchorRef: { current: string | null };
  storage: GalleryStorageWorkflow['actions'];
}): GalleryAppStateController['actions'] {
  return {
    filters: {
      setActiveTags: args.filters.actions.setActiveTags,
      setFolderFilter: args.filters.actions.setFolderFilter,
      setSearch: args.filters.actions.setSearch,
      setSortMode: args.filters.actions.setSortMode,
    },
    preview: {
      setFilenameDraft: args.preview.actions.setFilenameDraft,
      setPreview: args.preview.actions.setPreview,
      setTagDraft: args.preview.actions.setTagDraft,
      setTagDrafts: args.preview.actions.setTagDrafts,
    },
    selection: {
      setSelectedIds: args.filters.actions.setSelectedIds,
      setSelectionTagDraft: args.filters.actions.setSelectionTagDraft,
      toggleSelection: (assetId, options) =>
        toggleSelectedGalleryItem(
          args.filters.actions.setSelectedIds,
          args.derived.filteredItems,
          args.selectionAnchorRef,
          assetId,
          options?.shiftKey
        ),
    },
    storage: {
      refresh: args.storage.refresh,
    },
    surface: {
      setBanner: args.storage.setBanner,
      setConfirmDialog: args.storage.setConfirmDialog,
      setIsBusy: args.storage.setIsBusy,
      setPendingExport: args.storage.setPendingExport,
      setPendingImport: args.storage.setPendingImport,
      setShowStorageManager: args.storage.setShowStorageManager,
    },
  };
}

function getInitialRecordingPreviewId(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('recordingId');
}

function findRecordingPreviewItem(items: GalleryItem[], recordingId: string): GalleryItem | null {
  return (
    items.find(
      (item) =>
        isGalleryMediaItem(item) &&
        item.source.kind === 'recording' &&
        item.source.recordingId === recordingId
    ) ?? null
  );
}

function useInitialRecordingPreview({
  filteredItems,
  setFolderFilter,
  setPreview,
}: {
  filteredItems: GalleryItem[];
  setFolderFilter: GalleryFiltersState['actions']['setFolderFilter'];
  setPreview: GalleryPreviewState['actions']['setPreview'];
}) {
  const initialRecordingIdRef = useRef(getInitialRecordingPreviewId());
  const appliedRef = useRef(false);

  useEffect(() => {
    const recordingId = initialRecordingIdRef.current;
    if (appliedRef.current || !recordingId) {
      return;
    }

    const item = findRecordingPreviewItem(filteredItems, recordingId);
    if (!item) {
      return;
    }

    appliedRef.current = true;
    setFolderFilter('recording');
    setPreview({
      inspectorCollapsed: false,
      item,
      url: null,
    });
  }, [filteredItems, setFolderFilter, setPreview]);
}

export function useGalleryAppState(viewMode: GalleryViewMode): GalleryAppStateController {
  const filters = useGalleryFilterState();
  const preview = useGalleryPreviewState();
  const storage = useGalleryStorageWorkflow({
    setPreview: preview.actions.setPreview,
    setSelectedIds: filters.actions.setSelectedIds,
  });
  const viewport = useGalleryViewportState();
  const derived = useGalleryDerivedState({
    filters,
    library: storage.library,
    viewMode,
    viewport,
  });
  const selectionAnchorRef = useRef<string | null>(null);
  useInitialRecordingPreview({
    filteredItems: derived.filteredItems,
    setFolderFilter: filters.actions.setFolderFilter,
    setPreview: preview.actions.setPreview,
  });
  const state = buildGalleryAppState({
    derived,
    filters,
    preview,
    storage: storage.state,
    viewport,
  });
  const actions = buildGalleryAppActions({
    derived,
    filters,
    preview,
    selectionAnchorRef,
    storage: storage.actions,
  });

  return {
    actions,
    refs: {
      gridViewportRef: viewport.gridViewportRef,
      importInputRef: viewport.importInputRef,
    },
    state,
  };
}
