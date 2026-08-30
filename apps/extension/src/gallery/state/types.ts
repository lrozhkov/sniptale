import type { Dispatch, RefObject, SetStateAction } from 'react';
import type {
  MediaHubBackupExportOptions,
  MediaHubBackupSummary,
  MediaHubLocalBackupSummary,
} from '../../workflows/media-hub-backup/index';
import type { MediaHubImportConflictStrategy } from '../../workflows/media-hub-backup/index';
import type { StorageEstimateInfo } from '../../features/media-hub/storage-capacity';
import type { GalleryItem } from '../library/items';
import type { GallerySavedView } from '../../composition/persistence/gallery-saved-views';
import type { ActiveImportState } from '../library/import-types';
import type {
  PendingMediaFileImportState,
  PendingWebSnapshotImportState,
} from '../library/import-types';
import type {
  FolderFilter,
  GalleryFolderCounts,
  GalleryGridMetrics,
  GalleryFacetDefinition,
  GalleryFacetFilterId,
  GalleryFacetFilters,
  GalleryScope,
  GalleryPreviewSessionState,
  SortMode,
} from '../library/types';

export type {
  FolderFilter,
  GalleryFolderCounts,
  GalleryGridMetrics,
  GalleryPreviewSessionState,
  GalleryViewMode,
  GalleryScope,
  GalleryFacetDefinition,
  GalleryFacetFilterId,
  GalleryFacetFilters,
  SortMode,
} from '../library/types';

export interface PendingImportState {
  file: File;
  resumeOperationId?: string;
  resumeStrategy?: MediaHubImportConflictStrategy;
  summary: MediaHubBackupSummary;
}

export interface PendingExportState {
  options: MediaHubBackupExportOptions;
  summary: MediaHubLocalBackupSummary;
}

export type { ActiveImportState } from '../library/import-types';

export interface GalleryConfirmDialogState {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  onConfirm: () => Promise<void>;
}

interface GalleryPreviewDraftState {
  filename: string;
  hasChanges: boolean;
  tagInput: string;
  tags: string[];
}

interface GalleryAppFilterState {
  activeSavedView: GallerySavedView | null;
  folderFilter: FolderFilter;
  sortMode: SortMode;
  search: string;
  scope: GalleryScope;
  activeTags: string[];
  facetFilters: GalleryFacetFilters;
  isSavedViewDirty: boolean;
  savedViews: GallerySavedView[];
  savedViewsLoadFailed: boolean;
  savedViewsLoaded: boolean;
}

interface GalleryAppSelectionState {
  selectedIds: Set<string>;
  selectionTagDraft: string;
  selectedItems: GalleryItem[];
  selectedSize: number;
}

interface GalleryAppPreviewState {
  session: GalleryPreviewSessionState;
  draft: GalleryPreviewDraftState;
}

interface GalleryAppStorageState {
  activeImport: ActiveImportState | null;
  storageInfo: StorageEstimateInfo | null;
  pendingImport: PendingImportState | null;
  pendingMediaImport: PendingMediaFileImportState | null;
  pendingWebSnapshotImport: PendingWebSnapshotImportState | null;
  pendingExport: PendingExportState | null;
  confirmDialog: GalleryConfirmDialogState | null;
  banner: string | null;
  isLoading: boolean;
  isBusy: boolean;
}

interface GalleryAppDerivedState {
  allItems: GalleryItem[];
  allTags: string[];
  counts: GalleryFolderCounts;
  facets: GalleryFacetDefinition[];
  filteredItems: GalleryItem[];
  activeStorageBarClass: string;
  visibleItems: GalleryItem[];
  gridWidth: number;
  gridMetrics: GalleryGridMetrics;
}

export interface GalleryAppState {
  derived: GalleryAppDerivedState;
  filters: GalleryAppFilterState;
  preview: GalleryAppPreviewState;
  selection: GalleryAppSelectionState;
  storage: GalleryAppStorageState;
}

interface GalleryAppRefs {
  gridViewportRef: RefObject<HTMLDivElement | null>;
  importInputRef: RefObject<HTMLInputElement | null>;
  importTriggerRef: RefObject<HTMLButtonElement | null>;
  mediaImportInputRef: RefObject<HTMLInputElement | null>;
  mediaImportTriggerRef: RefObject<HTMLButtonElement | null>;
  webSnapshotImportInputRef: RefObject<HTMLInputElement | null>;
  webSnapshotImportTriggerRef: RefObject<HTMLButtonElement | null>;
}

interface GalleryAppStorageActions {
  refresh: () => Promise<void>;
}

interface GalleryAppFilterActions {
  createSavedView: (name: string) => Promise<GallerySavedView>;
  deleteSavedView: (id: string) => Promise<void>;
  moveSavedView: (id: string, direction: 'down' | 'up') => Promise<void>;
  reloadSavedViews: () => Promise<void>;
  resetFilters: () => void;
  selectSavedView: (id: string) => void;
  setFolderFilter: Dispatch<SetStateAction<FolderFilter>>;
  setSortMode: Dispatch<SetStateAction<SortMode>>;
  setSearch: Dispatch<SetStateAction<string>>;
  setScope: Dispatch<SetStateAction<GalleryScope>>;
  setActiveTags: Dispatch<SetStateAction<string[]>>;
  setFacetFilter: (id: GalleryFacetFilterId, values: string[]) => void;
  updateSavedView: () => Promise<void>;
}

interface GalleryAppSelectionActions {
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
  setSelectionTagDraft: Dispatch<SetStateAction<string>>;
  toggleSelection: (assetId: string, options?: { shiftKey?: boolean }) => void;
}

interface GalleryAppPreviewActions {
  setPreview: Dispatch<SetStateAction<GalleryPreviewSessionState>>;
  setFilenameDraft: Dispatch<SetStateAction<string>>;
  setTagDraft: Dispatch<SetStateAction<string>>;
  setTagDrafts: Dispatch<SetStateAction<string[]>>;
}

interface GalleryAppSurfaceActions {
  beginBlockingOperation: () => () => void;
  cancelActiveBackupExport: () => void;
  releaseActiveBackupExport: (abortController: AbortController) => void;
  replaceActiveBackupExport: (abortController: AbortController) => void;
  setActiveImport: Dispatch<SetStateAction<ActiveImportState | null>>;
  setPendingImport: Dispatch<SetStateAction<PendingImportState | null>>;
  setPendingMediaImport: Dispatch<SetStateAction<PendingMediaFileImportState | null>>;
  setPendingWebSnapshotImport: Dispatch<SetStateAction<PendingWebSnapshotImportState | null>>;
  setPendingExport: Dispatch<SetStateAction<PendingExportState | null>>;
  setConfirmDialog: Dispatch<SetStateAction<GalleryConfirmDialogState | null>>;
  setBanner: Dispatch<SetStateAction<string | null>>;
}

interface GalleryAppActions {
  filters: GalleryAppFilterActions;
  preview: GalleryAppPreviewActions;
  selection: GalleryAppSelectionActions;
  storage: GalleryAppStorageActions;
  surface: GalleryAppSurfaceActions;
}

export interface GalleryAppStateController {
  actions: GalleryAppActions;
  refs: GalleryAppRefs;
  state: GalleryAppState;
}

export type GalleryCommandPaletteController = Pick<
  GalleryAppStateController,
  'actions' | 'refs' | 'state'
>;
