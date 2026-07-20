import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react';
import type { ScenarioProjectSummary } from '../../../features/scenario/contracts/types/project';
import type { FolderFilter, GalleryGridMetrics, GalleryViewMode, SortMode } from '../types';
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
  selectedIds: Set<string>;
  selectedItems: GalleryItem[];
  selectedSize: number;
  selectionTagDraft: string;
  sortMode: SortMode;
  visibleItems: GalleryItem[];
  viewMode: GalleryViewMode;
  onApplySelectionTag: () => void;
  onBannerDismiss: () => void;
  onClearSelection: () => void;
  onDeleteMany: (items: GalleryItem[]) => void;
  onPreviewOpen: (item: GalleryItem, options?: { inspectorCollapsed?: boolean }) => void;
  onScenarioPreviewOpen?: (projectId: string) => void;
  onRefresh: () => void;
  onSearchChange: Dispatch<SetStateAction<string>>;
  onSelectionTagDraftChange: Dispatch<SetStateAction<string>>;
  onSelectionZip: () => void;
  onSortModeChange: Dispatch<SetStateAction<SortMode>>;
  onStorageManagerOpen: () => void;
  onToggleSelection: (assetId: string, options?: { shiftKey?: boolean }) => void;
  onViewModeChange: Dispatch<SetStateAction<GalleryViewMode>>;
}
