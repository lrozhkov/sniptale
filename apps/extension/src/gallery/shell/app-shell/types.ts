import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { MediaHubImportConflictStrategy } from '../../../workflows/media-hub-backup/index';
import type {
  MediaHubBackupExportOptions,
  MediaHubLocalBackupSummary,
} from '../../../workflows/media-hub-backup/index';
import type { StorageCleanupGroup } from '../../../features/media-hub/types';
import type { ScenarioProjectSummary } from '../../../features/scenario/contracts/types/project';
import type {
  FolderFilter,
  GalleryAppState,
  GalleryScope,
  GalleryViewMode,
  SortMode,
} from '../../state/types';
import type { GalleryItem } from '../../library/items';

export interface GalleryAppLayoutProps {
  gridViewportRef: RefObject<HTMLDivElement | null>;
  importInputRef: RefObject<HTMLInputElement | null>;
  importTriggerRef: RefObject<HTMLButtonElement | null>;
  filteredScenarioProjects?: ScenarioProjectSummary[];
  scenarioPreviewProject?: ScenarioProjectSummary | null;
  scenarioProjects?: ScenarioProjectSummary[];
  state: GalleryAppState;
  viewMode: GalleryViewMode;
  onImportFileChange: (file: File | null) => void;
  onActiveImportCancel: () => void;
  onActiveImportDismiss: () => void;
  onStorageManagerOpen: () => void;
  onStorageManagerClose: () => void;
  onConfirmDialogClose: () => void;
  onStorageCleanup: (group: StorageCleanupGroup) => void;
  onPendingImportClose: () => void;
  onPendingExportClose: () => void;
  onBackupExportConfirm: (options: MediaHubBackupExportOptions) => void;
  onBackupExportInspect: (
    options: MediaHubBackupExportOptions
  ) => Promise<MediaHubLocalBackupSummary>;
  onImport: (strategy: MediaHubImportConflictStrategy) => void;
  onPreviewClose: () => void;
  onPreviewInspectorToggle: () => void;
  onFilenameChange: Dispatch<SetStateAction<string>>;
  onTagDraftChange: Dispatch<SetStateAction<string>>;
  onRemoveTag: (tag: string) => void;
  onAddTag: () => void;
  onPreviewResetChanges?: () => void;
  onSaveMetadata?: () => void;
  onPreviewDownload: () => void;
  onPreviewDownloadOriginal: () => void;
  onPreviewCopy: () => void;
  onPreviewEdit: (item: GalleryItem) => void;
  onPreviewOpenSnapshotScreenshot: () => void;
  onPreviewDelete: (item: GalleryItem) => void;
  onPreviewPromote?: (item: GalleryItem) => Promise<void>;
  onPreviewRestoreOriginal: () => void;
  onPreviewSaveCopy: () => void;
  onScenarioPreviewClose?: () => void;
  onFolderFilterChange: Dispatch<SetStateAction<FolderFilter>>;
  onScopeChange?: Dispatch<SetStateAction<GalleryScope>>;
  onActiveTagsChange: Dispatch<SetStateAction<string[]>>;
  onExportBackup: () => void;
  onImportBackupClick: () => void;
  onSearchChange: Dispatch<SetStateAction<string>>;
  onSortModeChange: Dispatch<SetStateAction<SortMode>>;
  onViewModeChange: Dispatch<SetStateAction<GalleryViewMode>>;
  onRefresh: () => void;
  onBannerDismiss: () => void;
  onSelectionTagDraftChange: Dispatch<SetStateAction<string>>;
  onApplySelectionTag: () => void;
  onSelectionZip: () => void;
  onDeleteMany: (items: GalleryItem[]) => void;
  onClearSelection: () => void;
  onToggleSelection: (assetId: string, options?: { shiftKey?: boolean }) => void;
  onPreviewOpen: (item: GalleryItem, options?: { inspectorCollapsed?: boolean }) => void;
  onScenarioPreviewOpen?: (projectId: string) => void;
}
