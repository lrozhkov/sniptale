import { useMemo } from 'react';
import {
  getActiveStorageBarClass,
  getAllGalleryTags,
  getFilteredGalleryItems,
  getGalleryFacets,
  getGalleryCounts,
  getGalleryGridMetrics,
} from './selectors';
import type { GalleryAppState } from './types';
import type { GalleryViewMode } from './types';
import type { GalleryItem } from '../library/items';
import { isGallerySelectableItem } from '../library/items';
import type { useGalleryFilterState } from './useGalleryFilterState';
import type { useGalleryLibraryState } from './useGalleryLibraryState';
import type { useGalleryViewportState } from './useGalleryViewportState';

type GalleryFiltersState = ReturnType<typeof useGalleryFilterState>;
type GalleryLibraryState = ReturnType<typeof useGalleryLibraryState>;
type GalleryViewportState = ReturnType<typeof useGalleryViewportState>;

const TRASH_ACTIVE_TAGS: string[] = [];
const TRASH_FACET_FILTERS: GalleryFiltersState['state']['facetFilters'] = {
  created: [],
  duration: [],
  format: [],
  resolution: [],
  size: [],
  source: [],
  updated: [],
};

function getGalleryStoragePressureClass(storageInfo: GalleryLibraryState['storageInfo']) {
  return getActiveStorageBarClass(
    storageInfo?.pressure === 'healthy' ? 'normal' : storageInfo?.pressure
  );
}

function getSelectedGalleryItems(
  items: GalleryLibraryState['items'],
  selectedIds: GalleryFiltersState['state']['selectedIds']
) {
  return items.filter((item) => selectedIds.has(item.id));
}

function getSelectedGallerySize(items: GalleryLibraryState['items']) {
  return items.reduce((total, item) => total + item.size, 0);
}

function getGalleryTrashRootCount(items: GalleryLibraryState['items']): number {
  const roots = new Set<string>();
  for (const item of items) {
    if (item.lifecycle?.trashedAt === undefined || !isGallerySelectableItem(item)) continue;
    roots.add(`${item.kind}:${item.entityId ?? item.id}`);
  }
  return roots.size;
}

function getDerivedFilteredGalleryItems(args: {
  activeTags: GalleryFiltersState['state']['activeTags'];
  facetFilters: GalleryFiltersState['state']['facetFilters'];
  folderFilter: GalleryFiltersState['state']['folderFilter'];
  items: GalleryLibraryState['items'];
  search: GalleryFiltersState['state']['appliedSearch'];
  scope: GalleryFiltersState['state']['scope'];
  sortMode: GalleryFiltersState['state']['sortMode'];
}) {
  return getFilteredGalleryItems({
    items: args.items,
    activeTags: args.activeTags,
    facetFilters: args.facetFilters,
    folderFilter: args.folderFilter,
    search: args.search,
    scope: args.scope,
    sortMode: args.sortMode,
  });
}

function getDerivedGalleryGridMetrics(args: {
  filteredItems: ReturnType<typeof getFilteredGalleryItems>;
  gridWidth: GalleryViewportState['gridWidth'];
  scrollTop: GalleryViewportState['scrollTop'];
  viewMode: GalleryViewMode;
  viewportHeight: GalleryViewportState['viewportHeight'];
}) {
  return getGalleryGridMetrics({
    filteredItems: args.filteredItems,
    gridWidth: args.gridWidth,
    scrollTop: args.scrollTop,
    viewMode: args.viewMode,
    viewportHeight: args.viewportHeight,
  });
}

function useGalleryFilterDerivedState(props: {
  filters: GalleryFiltersState;
  library: GalleryLibraryState;
}) {
  const { filters, library } = props;

  const counts = useMemo(() => getGalleryCounts(library.items), [library.items]);
  const scopedItems = useMemo(
    () =>
      library.items.filter(
        (item) =>
          filters.state.scope === 'all' ||
          (item.lifecycle?.storageClass ?? 'library') === filters.state.scope
      ),
    [filters.state.scope, library.items]
  );
  const allTags = useMemo(() => getAllGalleryTags(scopedItems), [scopedItems]);
  const facets = useMemo(
    () =>
      getGalleryFacets(library.items, {
        activeTags: filters.state.activeTags,
        facetFilters: filters.state.facetFilters,
        folderFilter: filters.state.folderFilter,
        scope: filters.state.scope,
      }),
    [
      filters.state.activeTags,
      filters.state.facetFilters,
      filters.state.folderFilter,
      filters.state.scope,
      library.items,
    ]
  );
  const filteredItems = useMemo(
    () =>
      getDerivedFilteredGalleryItems({
        activeTags: filters.state.activeTags,
        facetFilters: filters.state.facetFilters,
        folderFilter: filters.state.folderFilter,
        items: library.items,
        search: filters.state.appliedSearch,
        scope: filters.state.scope,
        sortMode: filters.state.sortMode,
      }),
    [
      filters.state.activeTags,
      filters.state.facetFilters,
      filters.state.folderFilter,
      filters.state.appliedSearch,
      filters.state.scope,
      filters.state.sortMode,
      library.items,
    ]
  );

  return {
    allTags,
    counts,
    filteredItems,
    facets,
  };
}

function useGallerySelectionDerivedState(props: {
  items: GalleryLibraryState['items'];
  selectedIds: GalleryFiltersState['state']['selectedIds'];
}) {
  const selectedItems = useMemo(
    () => getSelectedGalleryItems(props.items, props.selectedIds),
    [props.items, props.selectedIds]
  );

  return {
    selectedItems,
    selectedSize: getSelectedGallerySize(selectedItems),
  };
}

export function useGalleryDerivedState(props: {
  filters: GalleryFiltersState;
  library: GalleryLibraryState;
  viewMode: GalleryViewMode;
  viewport: GalleryViewportState;
}) {
  const { filters, viewport, viewMode } = props;
  const modeItems = useMemo(
    () =>
      props.library.items.filter(
        (item) =>
          Boolean(item.lifecycle?.trashedAt !== undefined) === Boolean(filters.state.trashMode)
      ),
    [props.library.items, filters.state.trashMode]
  );
  const library = { ...props.library, items: modeItems };
  const trashSummary = useMemo(
    () => ({
      count: getGalleryTrashRootCount(props.library.items),
      size: props.library.trashUsage,
    }),
    [props.library.items, props.library.trashUsage]
  );
  const modeFilters = filters.state.trashMode
    ? {
        ...filters,
        state: {
          ...filters.state,
          activeTags: TRASH_ACTIVE_TAGS,
          facetFilters: TRASH_FACET_FILTERS,
          folderFilter: 'all' as const,
          scope: 'all' as const,
        },
      }
    : filters;
  const filterState = useGalleryFilterDerivedState({ filters: modeFilters, library });
  const selectionState = useGallerySelectionDerivedState({
    items: library.items,
    selectedIds: filters.state.selectedIds,
  });
  const gridMetrics = useMemo(
    () =>
      getDerivedGalleryGridMetrics({
        filteredItems: filterState.filteredItems,
        gridWidth: viewport.gridWidth,
        scrollTop: viewport.scrollTop,
        viewMode,
        viewportHeight: viewport.viewportHeight,
      }),
    [
      filterState.filteredItems,
      viewMode,
      viewport.gridWidth,
      viewport.scrollTop,
      viewport.viewportHeight,
    ]
  );

  return {
    activeStorageBarClass: getGalleryStoragePressureClass(library.storageInfo),
    allItems: library.items,
    allTags: filterState.allTags,
    counts: filterState.counts,
    facets: filterState.facets,
    filteredItems: filterState.filteredItems,
    gridMetrics,
    selectedItems: selectionState.selectedItems,
    selectedSize: selectionState.selectedSize,
    trashSummary,
  } satisfies Pick<
    GalleryAppState['derived'],
    | 'activeStorageBarClass'
    | 'allItems'
    | 'allTags'
    | 'counts'
    | 'facets'
    | 'filteredItems'
    | 'gridMetrics'
    | 'trashSummary'
  > &
    Pick<GalleryAppState['selection'], 'selectedItems' | 'selectedSize'> & {
      gridMetrics: GalleryAppState['derived']['gridMetrics'] & { visibleItems: GalleryItem[] };
    };
}
