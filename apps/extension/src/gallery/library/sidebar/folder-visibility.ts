import { SIDEBAR_FOLDERS } from '../constants';
import type { FolderFilter, GalleryFolderCounts } from '../types';

export function isGalleryFolderAvailable(
  counts: GalleryFolderCounts,
  folder: FolderFilter
): boolean {
  return folder === 'all' || (counts[folder] ?? 0) > 0;
}

export function getRenderedGalleryFolders(args: {
  activeSavedView: boolean;
  counts: GalleryFolderCounts;
  focusedFolder: FolderFilter | null;
  folderFilter: FolderFilter;
}): FolderFilter[] {
  return SIDEBAR_FOLDERS.filter(
    (folder) =>
      isGalleryFolderAvailable(args.counts, folder) ||
      (folder === args.folderFilter && !args.activeSavedView) ||
      folder === args.focusedFolder
  );
}
