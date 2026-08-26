import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react';
import type { ScenarioProjectSummary } from '../../../features/scenario/contracts/types/project';
import type {
  FolderFilter,
  GalleryGridMetrics,
  GalleryScope,
  GalleryViewMode,
  SortMode,
} from '../types';
import type { GalleryItem } from '../items';

export interface GalleryMainContentProps {
  allTags?: string[];
  banner: string | null;
  children?: ReactNode;
  filteredItems: GalleryItem[];
  filteredScenarioProjects?: ScenarioProjectSummary[];
  folderFilter: FolderFilter;
  gridMetrics: GalleryGridMetrics;
  gridWidth: number;
  gridViewportRef: RefObject<HTMLDivElement | null>;
  isLoading: boolean;
  search: string;
  scope: GalleryScope;
  selectedIds: Set<string>;
  selectedItems: GalleryItem[];
  selectedSize: number;
  selectionTagDraft: string;
  sortMode: SortMode;
  visibleItems: GalleryItem[];
  viewMode: GalleryViewMode;
  onApplySelectionTag: (tag?: string) => void;
  onBannerDismiss: () => void;
  onClearSelection: () => void;
  onDeleteMany: (items: GalleryItem[]) => void;
  onPreviewOpen: (item: GalleryItem, options?: { inspectorCollapsed?: boolean }) => void;
  onRecordingGroupOpen?: (item: GalleryItem) => void;
  onScenarioPreviewOpen?: (projectId: string) => void;
  onSearchChange: Dispatch<SetStateAction<string>>;
  onScopeChange: Dispatch<SetStateAction<GalleryScope>>;
  onSelectionTagDraftChange: Dispatch<SetStateAction<string>>;
  onSelectionBackup: () => void;
  onSelectionZip: () => void;
  onSortModeChange: Dispatch<SetStateAction<SortMode>>;
  onToggleSelection: (assetId: string, options?: { shiftKey?: boolean }) => void;
  onViewModeChange: Dispatch<SetStateAction<GalleryViewMode>>;
}
