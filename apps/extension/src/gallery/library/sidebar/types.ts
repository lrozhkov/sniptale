import type { Dispatch, SetStateAction } from 'react';
import type { FolderFilter, GalleryFolderCounts, GalleryScope } from '../types';

export interface GallerySidebarProps {
  activeStorageBarClass: string;
  activeTags: string[];
  allTags: string[];
  counts: GalleryFolderCounts;
  folderFilter: FolderFilter;
  scope?: GalleryScope;
  isBusy: boolean;
  onActiveTagsChange: Dispatch<SetStateAction<string[]>>;
  onExportBackup: () => void;
  onFolderFilterChange: Dispatch<SetStateAction<FolderFilter>>;
  onScopeChange?: Dispatch<SetStateAction<GalleryScope>>;
  onImportBackupClick: () => void;
  onStorageManagerOpen: () => void;
  storageInfo: {
    isPersistent?: boolean;
    quota?: number;
    usage: number;
    usageRatio?: number;
  } | null;
}
