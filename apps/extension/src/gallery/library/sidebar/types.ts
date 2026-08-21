import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { FolderFilter, GalleryFolderCounts, GalleryScope } from '../types';

export interface GallerySidebarProps {
  activeStorageBarClass: string;
  activeTags: string[];
  allTags: string[];
  counts: GalleryFolderCounts;
  folderFilter: FolderFilter;
  scope?: GalleryScope;
  isBusy: boolean;
  importTriggerRef: RefObject<HTMLButtonElement | null>;
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
