import type { Dispatch, RefObject, SetStateAction } from 'react';
import type {
  MediaHubBackupExportOptions,
  MediaHubBackupSummary,
  MediaHubLocalBackupSummary,
} from '../../workflows/media-hub-backup/index';
import type { StorageCleanupReport } from '../../features/media-hub/types';
import type { StorageEstimateInfo } from '../../features/media-hub/storage-capacity';
import type { GalleryItem } from '../library/items';
import type {
  FolderFilter,
  GalleryFolderCounts,
  GalleryGridMetrics,
  GalleryPreviewSessionState,
  SortMode,
} from '../library/types';

export type {
  FolderFilter,
  GalleryFolderCounts,
  GalleryGridMetrics,
  GalleryPreviewSessionState,
  GalleryViewMode,
  SortMode,
} from '../library/types';

export interface PendingImportState {
  file: File;
  summary: MediaHubBackupSummary;
}

export interface PendingExportState {
  options: MediaHubBackupExportOptions;
  summary: MediaHubLocalBackupSummary;
}

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
  folderFilter: FolderFilter;
  sortMode: SortMode;
  search: string;
  activeTags: string[];
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
  storageInfo: StorageEstimateInfo | null;
  cleanupReport: StorageCleanupReport | null;
  showStorageManager: boolean;
  pendingImport: PendingImportState | null;
  pendingExport: PendingExportState | null;
  confirmDialog: GalleryConfirmDialogState | null;
  banner: string | null;
  isLoading: boolean;
  isBusy: boolean;
}

interface GalleryAppDerivedState {
  allTags: string[];
  counts: GalleryFolderCounts;
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
}

interface GalleryAppStorageActions {
  refresh: () => Promise<void>;
}

interface GalleryAppFilterActions {
  setFolderFilter: Dispatch<SetStateAction<FolderFilter>>;
  setSortMode: Dispatch<SetStateAction<SortMode>>;
  setSearch: Dispatch<SetStateAction<string>>;
  setActiveTags: Dispatch<SetStateAction<string[]>>;
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
  setShowStorageManager: Dispatch<SetStateAction<boolean>>;
  setPendingImport: Dispatch<SetStateAction<PendingImportState | null>>;
  setPendingExport: Dispatch<SetStateAction<PendingExportState | null>>;
  setConfirmDialog: Dispatch<SetStateAction<GalleryConfirmDialogState | null>>;
  setBanner: Dispatch<SetStateAction<string | null>>;
  setIsBusy: Dispatch<SetStateAction<boolean>>;
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
