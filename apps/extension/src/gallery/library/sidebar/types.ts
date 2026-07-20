import type { Dispatch, SetStateAction } from 'react';
import type { FolderFilter, GalleryFolderCounts } from '../types';

export interface GallerySidebarProps {
  activeStorageBarClass: string;
  activeTags: string[];
  allTags: string[];
  counts: GalleryFolderCounts;
  folderFilter: FolderFilter;
  isBusy: boolean;
  onActiveTagsChange: Dispatch<SetStateAction<string[]>>;
  onExportBackup: () => void;
  onFolderFilterChange: Dispatch<SetStateAction<FolderFilter>>;
  onImportBackupClick: () => void;
  onStorageManagerOpen: () => void;
  storageInfo: {
    isPersistent?: boolean;
    quota?: number;
    usage: number;
    usageRatio?: number;
  } | null;
}
