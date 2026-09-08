import { compareStrings, translate } from '../../platform/i18n';
import { formatBytes } from '../../platform/i18n/format-bytes';
import type { ScenarioProjectSummary } from '../../features/scenario/contracts/types/project';
import {
  FOLDER_FILTER_KIND_MAP,
  getGalleryGridCardLayout,
  GRID_CARD_MIN_WIDTH_BY_MODE,
  GRID_GAP,
  GRID_OVERSCAN_ROWS,
} from '../library/constants';
import type {
  FolderFilter,
  GalleryFolderCounts,
  GalleryGridMetrics,
  GalleryFacetDefinition,
  GalleryFacetFilterId,
  GalleryFacetFilters,
  GalleryScope,
  GalleryViewMode,
  SortMode,
} from './types';
import { isGalleryMediaItem, type GalleryItem } from '../library/items';
import { formatDate } from '../library/ui';
import { getGalleryDateBucketLabel } from './date-facets';
import {
  SIZE_BUCKETS,
  DURATION_BUCKETS,
  LIBRARY_DATE_BUCKET_IDS,
  getLibraryFacetValue,
  matchesLibraryFilters,
} from '../../features/media-hub/library-filters';

function incrementCount(counts: Map<string, number>, value: string | null): void {
  if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
}

function getSizeBucketLabel(id: string): string {
  const bucket = SIZE_BUCKETS.find((candidate) => candidate.id === id);
  if (!bucket) return id;
  if (bucket.min === 0) return `≤ ${formatBytes(bucket.max)}`;
  if (!Number.isFinite(bucket.max)) return `≥ ${formatBytes(bucket.min)}`;
  return `${formatBytes(bucket.min)}–${formatBytes(bucket.max)}`;
}

function getFacetOptionLabel(id: GalleryFacetFilterId, value: string): string {
  if (id === 'created' || id === 'updated') return getGalleryDateBucketLabel(value);
  if (id === 'format') return value.toUpperCase();
  if (id === 'size') return getSizeBucketLabel(value);
  if (id === 'resolution') {
    const labels: Record<string, string> = {
      compact: translate('gallery.app.facetResolution.compact'),
      hd: translate('gallery.app.facetResolution.hd'),
      'full-hd': translate('gallery.app.facetResolution.full-hd'),
      qhd: translate('gallery.app.facetResolution.qhd'),
      uhd: translate('gallery.app.facetResolution.uhd'),
    };
    return labels[value] ?? value;
  }
  if (id === 'duration') {
    const labels: Record<string, string> = {
      'under-minute': translate('gallery.app.facetDuration.under-minute'),
      '1-5-minutes': translate('gallery.app.facetDuration.1-5-minutes'),
      '5-30-minutes': translate('gallery.app.facetDuration.5-30-minutes'),
      'over-30-minutes': translate('gallery.app.facetDuration.over-30-minutes'),
    };
    return labels[value] ?? value;
  }
  return value;
}

function createFacetDefinition(
  id: GalleryFacetFilterId,
  counts: Map<string, number>,
  selectedValues: string[] = []
): GalleryFacetDefinition {
  const values = new Set([...counts.keys(), ...selectedValues]);
  const options = Array.from(values, (value) => ({
    count: counts.get(value) ?? 0,
    label: getFacetOptionLabel(id, value),
    value,
  })).sort((left, right) => {
    if (id === 'size') {
      return (
        SIZE_BUCKETS.findIndex((bucket) => bucket.id === left.value) -
        SIZE_BUCKETS.findIndex((bucket) => bucket.id === right.value)
      );
    }
    if (id === 'duration') {
      return (
        DURATION_BUCKETS.findIndex((bucket) => bucket.id === left.value) -
        DURATION_BUCKETS.findIndex((bucket) => bucket.id === right.value)
      );
    }
    if (id === 'created' || id === 'updated') {
      return (
        LIBRARY_DATE_BUCKET_IDS.indexOf(left.value as (typeof LIBRARY_DATE_BUCKET_IDS)[number]) -
        LIBRARY_DATE_BUCKET_IDS.indexOf(right.value as (typeof LIBRARY_DATE_BUCKET_IDS)[number])
      );
    }
    return left.label.localeCompare(right.label);
  });
  return { id, options, searchable: options.length > 10 };
}

export function getGalleryFacets(
  items: GalleryItem[],
  context: {
    activeTags?: string[];
    facetFilters?: GalleryFacetFilters;
    folderFilter?: FolderFilter;
    now?: number;
    scope?: GalleryScope;
  } = {}
): GalleryFacetDefinition[] {
  const facetIds: GalleryFacetFilterId[] = [
    'created',
    'updated',
    'format',
    'size',
    'resolution',
    'duration',
    'source',
  ];
  const now = context.now ?? Date.now();
  const counts = new Map(facetIds.map((id) => [id, new Map<string, number>()]));
  const tagCounts = new Map<string, number>();
  const statusCounts = new Map<string, number>();
  const categoryItems = context.folderFilter
    ? items.filter((item) => matchesGalleryFolderFilter(context.folderFilter!, item.kind))
    : items;
  const facetItems =
    context.scope && context.scope !== 'all'
      ? categoryItems.filter(
          (item) => (item.lifecycle?.storageClass ?? 'library') === context.scope
        )
      : categoryItems;

  for (const item of categoryItems) {
    incrementCount(statusCounts, item.lifecycle?.storageClass ?? 'library');
  }

  for (const item of facetItems) {
    item.tags.forEach((tag) => incrementCount(tagCounts, tag));
    facetIds.forEach((id) => incrementCount(counts.get(id)!, getLibraryFacetValue(item, id, now)));
  }

  return [
    {
      id: 'status',
      searchable: false,
      options: ['library', 'temporary'].map((value) => ({
        count: statusCounts.get(value) ?? 0,
        label:
          value === 'library'
            ? translate('gallery.app.facetStatus.library')
            : translate('gallery.app.facetStatus.temporary'),
        value,
      })),
    },
    {
      id: 'tags',
      searchable: tagCounts.size > 10,
      options: Array.from(
        new Set([...tagCounts.keys(), ...(context.activeTags ?? [])]),
        (value) => ({
          count: tagCounts.get(value) ?? 0,
          label: value,
          value,
        })
      ).sort((left, right) => compareStrings(left.label, right.label)),
    },
    ...facetIds.map((id) =>
      createFacetDefinition(id, counts.get(id)!, context.facetFilters?.[id] ?? [])
    ),
  ];
}

function matchesGalleryFolderFilter(
  folderFilter: FolderFilter,
  kind: GalleryItem['kind']
): boolean {
  if (folderFilter === 'all') {
    return true;
  }

  if (folderFilter === 'scenario') {
    return kind === 'scenario' || kind === 'scenario-export';
  }

  return FOLDER_FILTER_KIND_MAP[folderFilter].includes(kind);
}

export function getGalleryCounts(
  items: GalleryItem[],
  scenarioProjects: ScenarioProjectSummary[] = []
): GalleryFolderCounts {
  const next: GalleryFolderCounts = {
    all: 0,
    screenshot: 0,
    recording: 0,
    export: 0,
    'web-snapshot': 0,
    scenario: 0,
  };

  for (const item of items) {
    next.all += 1;

    if (item.kind === 'scenario' || item.kind === 'scenario-export') {
      next.scenario += 1;
      if (item.kind === 'scenario') {
        continue;
      }
    }

    if (FOLDER_FILTER_KIND_MAP.screenshot.includes(item.kind)) {
      next.screenshot += 1;
    }

    if (FOLDER_FILTER_KIND_MAP.recording.includes(item.kind)) {
      next.recording += 1;
    }

    if (FOLDER_FILTER_KIND_MAP.export.includes(item.kind)) {
      next.export += 1;
    }

    if (FOLDER_FILTER_KIND_MAP['web-snapshot'].includes(item.kind)) {
      next['web-snapshot'] += 1;
    }
  }

  if (items.length === 0 && scenarioProjects.length > 0) {
    next.all = scenarioProjects.length;
    next.scenario = scenarioProjects.length;
  }

  return next;
}

export function getFilteredScenarioProjects(args: {
  projects: ScenarioProjectSummary[];
  search: string;
  sortMode: SortMode;
}) {
  const normalizedSearch = args.search.trim().toLowerCase();
  const result = args.projects.filter((project) => {
    if (!normalizedSearch) {
      return true;
    }

    return [project.name, formatDate(project.createdAt), formatDate(project.updatedAt)].some(
      (value) => value.toLowerCase().includes(normalizedSearch)
    );
  });

  result.sort((left, right) => {
    if (args.sortMode === 'oldest') {
      return left.updatedAt - right.updatedAt;
    }

    if (args.sortMode === 'name-asc') {
      return compareStrings(left.name, right.name);
    }

    if (args.sortMode === 'name-desc') {
      return compareStrings(right.name, left.name);
    }

    return right.updatedAt - left.updatedAt;
  });

  return result;
}

export function getAllGalleryTags(items: GalleryItem[]): string[] {
  return Array.from(new Set(items.flatMap((item) => item.tags))).sort(compareStrings);
}

export function getFilteredGalleryItems(args: {
  activeTags: string[];
  facetFilters?: GalleryFacetFilters;
  folderFilter: FolderFilter;
  items: GalleryItem[];
  now?: number;
  search: string;
  scope?: GalleryScope;
  sortMode: SortMode;
}): GalleryItem[] {
  const now = args.now ?? Date.now();
  const normalizedSearch = args.search.trim().toLowerCase();
  const scope = args.scope ?? 'library';
  const taggedItems = args.items.filter((item) =>
    matchesLibraryFilters(
      item,
      {
        activeTags: args.activeTags,
        ...(args.facetFilters ? { facetFilters: args.facetFilters } : {}),
        scope,
      },
      now
    )
  );
  const result = taggedItems.filter((item) => {
    if (!matchesGalleryFolderFilter(args.folderFilter, item.kind)) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    return [
      item.filename,
      item.sourceTitle ?? '',
      item.sourceUrl ?? '',
      item.mimeType,
      ...item.tags,
      formatDate(item.createdAt),
      formatDate(item.updatedAt),
    ].some((value) => value.toLowerCase().includes(normalizedSearch));
  });

  result.sort((left, right) => {
    if (args.sortMode === 'oldest') {
      return left.createdAt - right.createdAt;
    }

    if (args.sortMode === 'name-asc') {
      return compareStrings(left.filename, right.filename);
    }

    if (args.sortMode === 'name-desc') {
      return compareStrings(right.filename, left.filename);
    }

    if (args.sortMode === 'size-desc') {
      return right.size - left.size;
    }

    return right.createdAt - left.createdAt;
  });

  return result;
}

export function getGalleryGridMetrics(args: {
  filteredItems: GalleryItem[];
  gridWidth: number;
  scrollTop: number;
  viewMode: GalleryViewMode;
  viewportHeight: number;
}): GalleryGridMetrics & { visibleItems: GalleryItem[] } {
  const displayItems =
    args.viewMode === 'list'
      ? args.filteredItems
      : collapseGalleryRecordingGroups(args.filteredItems);

  if (args.viewMode === 'list') {
    return {
      columnCount: 1,
      startRow: 0,
      totalRows: displayItems.length,
      visibleItems: displayItems,
    };
  }

  const cardMinWidth = GRID_CARD_MIN_WIDTH_BY_MODE[args.viewMode];
  const columnCount = Math.max(
    1,
    Math.floor((args.gridWidth + GRID_GAP) / (cardMinWidth + GRID_GAP))
  );
  const { rowHeight } = getGalleryGridCardLayout({
    columnCount,
    gridWidth: args.gridWidth,
    viewMode: args.viewMode,
  });
  const totalRows = Math.ceil(displayItems.length / columnCount);
  const startRow = Math.max(0, Math.floor(args.scrollTop / rowHeight) - GRID_OVERSCAN_ROWS);
  const endRow = Math.min(
    totalRows,
    Math.ceil((args.scrollTop + args.viewportHeight) / rowHeight) + GRID_OVERSCAN_ROWS
  );

  return {
    columnCount,
    startRow,
    totalRows,
    visibleItems: displayItems.slice(startRow * columnCount, endRow * columnCount),
  };
}

export function collapseGalleryRecordingGroups(items: GalleryItem[]): GalleryItem[] {
  const emittedGroups = new Set<string>();

  return items.filter((item) => {
    if (!isGalleryMediaItem(item) || !item.recordingGroupView) {
      return true;
    }

    const groupId = item.recordingGroupView.groupId;
    if (emittedGroups.has(groupId)) {
      return false;
    }
    emittedGroups.add(groupId);
    return true;
  });
}

export function getActiveStorageBarClass(
  pressure: 'critical' | 'warning' | 'normal' | undefined
): string {
  if (pressure === 'critical') {
    return 'bg-rose-500';
  }

  if (pressure === 'warning') {
    return 'bg-amber-400';
  }

  return 'bg-emerald-400';
}
