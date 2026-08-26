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
import type { useGalleryFilterState } from './useGalleryFilterState';
import type { useGalleryLibraryState } from './useGalleryLibraryState';
import type { useGalleryViewportState } from './useGalleryViewportState';

type GalleryFiltersState = ReturnType<typeof useGalleryFilterState>;
type GalleryLibraryState = ReturnType<typeof useGalleryLibraryState>;
type GalleryViewportState = ReturnType<typeof useGalleryViewportState>;

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

function getDerivedFilteredGalleryItems(args: {
  activeTags: GalleryFiltersState['state']['activeTags'];
  facetFilters: GalleryFiltersState['state']['facetFilters'];
  folderFilter: GalleryFiltersState['state']['folderFilter'];
  items: GalleryLibraryState['items'];
  search: GalleryFiltersState['state']['search'];
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

  const scopedItems = useMemo(
    () =>
      library.items.filter(
        (item) =>
          filters.state.scope === 'all' ||
          (item.lifecycle?.storageClass ?? 'library') === filters.state.scope
      ),
    [filters.state.scope, library.items]
  );
  const counts = useMemo(() => getGalleryCounts(scopedItems), [scopedItems]);
  const allTags = useMemo(() => getAllGalleryTags(scopedItems), [scopedItems]);
  const facets = useMemo(
    () =>
      getGalleryFacets(library.items, {
        folderFilter: filters.state.folderFilter,
        scope: filters.state.scope,
      }),
    [filters.state.folderFilter, filters.state.scope, library.items]
  );
  const filteredItems = useMemo(
    () =>
      getDerivedFilteredGalleryItems({
        activeTags: filters.state.activeTags,
        facetFilters: filters.state.facetFilters,
        folderFilter: filters.state.folderFilter,
        items: library.items,
        search: filters.state.search,
        scope: filters.state.scope,
        sortMode: filters.state.sortMode,
      }),
    [
      filters.state.activeTags,
      filters.state.facetFilters,
      filters.state.folderFilter,
      filters.state.search,
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
  const { filters, library, viewport, viewMode } = props;
  const filterState = useGalleryFilterDerivedState({ filters, library });
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
  } satisfies Pick<
    GalleryAppState['derived'],
    | 'activeStorageBarClass'
    | 'allItems'
    | 'allTags'
    | 'counts'
    | 'facets'
    | 'filteredItems'
    | 'gridMetrics'
  > &
    Pick<GalleryAppState['selection'], 'selectedItems' | 'selectedSize'> & {
      gridMetrics: GalleryAppState['derived']['gridMetrics'] & { visibleItems: GalleryItem[] };
    };
}
