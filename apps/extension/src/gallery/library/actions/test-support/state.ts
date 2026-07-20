import type { GalleryAppState, GalleryPreviewSessionState } from '../../../state/types';
import type { GalleryItem } from '../../items';

export type GalleryStateOverride = Partial<GalleryAppState> & {
  allTags?: GalleryAppState['derived']['allTags'];
  cleanupReport?: GalleryAppState['storage']['cleanupReport'];
  confirmDialog?: GalleryAppState['storage']['confirmDialog'];
  counts?: GalleryAppState['derived']['counts'];
  filteredItems?: GalleryAppState['derived']['filteredItems'];
  filenameDraft?: string;
  folderFilter?: GalleryAppState['filters']['folderFilter'];
  pendingExport?: GalleryAppState['storage']['pendingExport'];
  pendingImport?: GalleryAppState['storage']['pendingImport'];
  previewDraft?: GalleryAppState['preview']['draft'];
  previewInspectorCollapsed?: boolean;
  previewItem?: GalleryItem | null;
  previewUrl?: string | null;
  selectedIds?: GalleryAppState['selection']['selectedIds'];
  selectedItems?: GalleryAppState['selection']['selectedItems'];
  search?: GalleryAppState['filters']['search'];
  selectionTagDraft?: GalleryAppState['selection']['selectionTagDraft'];
  showStorageManager?: GalleryAppState['storage']['showStorageManager'];
  sortMode?: GalleryAppState['filters']['sortMode'];
  storageInfo?: GalleryAppState['storage']['storageInfo'];
  tagDraft?: string;
  tagDrafts?: string[];
};

function buildPreviewOverride(overrides: GalleryStateOverride): GalleryPreviewSessionState {
  if (overrides.preview?.session) {
    return overrides.preview.session;
  }

  return {
    inspectorCollapsed: overrides.previewInspectorCollapsed ?? false,
    item: overrides.previewItem ?? null,
    url: overrides.previewUrl ?? null,
  };
}

function haveLegacyDraftsChanged(overrides: GalleryStateOverride) {
  const previewItem = overrides.preview?.session.item ?? overrides.previewItem ?? null;
  const filenameDraft = overrides.filenameDraft;
  const tagDrafts = overrides.tagDrafts;

  if (!previewItem) {
    return false;
  }

  if (typeof filenameDraft === 'string' && filenameDraft.trim() !== previewItem.filename) {
    return true;
  }

  if (!Array.isArray(tagDrafts)) {
    return false;
  }

  const previewTags = previewItem.tags ?? [];
  return (
    tagDrafts.length !== previewTags.length ||
    tagDrafts.some((tag, index) => tag !== previewTags[index])
  );
}

function createGalleryDerivedState(overrides: GalleryStateOverride): GalleryAppState['derived'] {
  return {
    activeStorageBarClass: '',
    allTags: overrides.allTags ?? [],
    counts: overrides.counts ?? { all: 0, screenshot: 0, recording: 0, export: 0, scenario: 0 },
    filteredItems: overrides.filteredItems ?? [],
    gridMetrics: { columnCount: 1, startRow: 0, totalRows: 0 },
    gridWidth: 1200,
    visibleItems: [],
    ...overrides.derived,
  };
}

function createGalleryPreviewState(overrides: GalleryStateOverride): GalleryAppState['preview'] {
  return {
    draft: {
      filename: overrides.previewDraft?.filename ?? overrides.filenameDraft ?? '',
      hasChanges: overrides.previewDraft?.hasChanges ?? haveLegacyDraftsChanged(overrides),
      tagInput: overrides.previewDraft?.tagInput ?? overrides.tagDraft ?? '',
      tags: overrides.previewDraft?.tags ?? overrides.tagDrafts ?? [],
    },
    session: buildPreviewOverride(overrides),
    ...overrides.preview,
  };
}

export function createGalleryState(overrides: GalleryStateOverride = {}): GalleryAppState {
  return {
    derived: createGalleryDerivedState(overrides),
    filters: {
      activeTags: [],
      folderFilter: overrides.folderFilter ?? 'all',
      search: overrides.search ?? '',
      sortMode: overrides.sortMode ?? 'newest',
      ...overrides.filters,
    },
    preview: createGalleryPreviewState(overrides),
    selection: {
      selectedIds: overrides.selectedIds ?? new Set(),
      selectedItems: overrides.selectedItems ?? [],
      selectedSize: 0,
      selectionTagDraft: overrides.selectionTagDraft ?? '',
      ...overrides.selection,
    },
    storage: {
      banner: null,
      cleanupReport: overrides.cleanupReport ?? null,
      confirmDialog: overrides.confirmDialog ?? null,
      isBusy: false,
      isLoading: false,
      pendingExport: overrides.pendingExport ?? null,
      pendingImport: overrides.pendingImport ?? null,
      showStorageManager: overrides.showStorageManager ?? false,
      storageInfo: overrides.storageInfo ?? null,
      ...overrides.storage,
    },
  };
}
