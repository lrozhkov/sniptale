import { compareStrings } from '../../platform/i18n';
import type { ScenarioProjectSummary } from '../../features/scenario/contracts/types/project';
import {
  FOLDER_FILTER_KIND_MAP,
  GRID_CARD_MIN_WIDTH_BY_MODE,
  GRID_GAP,
  GRID_OVERSCAN_ROWS,
  GRID_ROW_HEIGHT_BY_MODE,
} from '../library/constants';
import type {
  FolderFilter,
  GalleryFolderCounts,
  GalleryGridMetrics,
  GalleryViewMode,
  SortMode,
} from './types';
import type { GalleryItem } from '../library/items';
import { formatDate } from '../library/ui';

function matchesGalleryFolderFilter(
  folderFilter: FolderFilter,
  kind: GalleryItem['kind']
): boolean {
  if (folderFilter === 'all') {
    return true;
  }

  if (folderFilter === 'scenario') {
    return kind === 'scenario';
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

    if (item.kind === 'scenario') {
      next.scenario += 1;
      continue;
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

    if (args.sortMode === 'size') {
      return compareStrings(left.name, right.name);
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
  folderFilter: FolderFilter;
  items: GalleryItem[];
  search: string;
  sortMode: SortMode;
}): GalleryItem[] {
  const normalizedSearch = args.search.trim().toLowerCase();
  const taggedItems = args.items.filter((item) => {
    return args.activeTags.every((tag) => item.tags.includes(tag));
  });
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

    if (args.sortMode === 'size') {
      return args.folderFilter === 'scenario'
        ? compareStrings(left.filename, right.filename)
        : right.size - left.size;
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
  if (args.viewMode === 'list') {
    return {
      columnCount: 1,
      startRow: 0,
      totalRows: args.filteredItems.length,
      visibleItems: args.filteredItems,
    };
  }

  const cardMinWidth = GRID_CARD_MIN_WIDTH_BY_MODE[args.viewMode];
  const rowHeight = GRID_ROW_HEIGHT_BY_MODE[args.viewMode];
  const columnCount = Math.max(
    1,
    Math.floor((args.gridWidth + GRID_GAP) / (cardMinWidth + GRID_GAP))
  );
  const totalRows = Math.ceil(args.filteredItems.length / columnCount);
  const startRow = Math.max(0, Math.floor(args.scrollTop / rowHeight) - GRID_OVERSCAN_ROWS);
  const endRow = Math.min(
    totalRows,
    Math.ceil((args.scrollTop + args.viewportHeight) / rowHeight) + GRID_OVERSCAN_ROWS
  );

  return {
    columnCount,
    startRow,
    totalRows,
    visibleItems: args.filteredItems.slice(startRow * columnCount, endRow * columnCount),
  };
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
